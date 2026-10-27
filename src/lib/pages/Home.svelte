<script>
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import AlertPreviewCard from '$lib/components/alerts/AlertPreviewCard.svelte';
	import EventCard from '$lib/components/EventCard.svelte';
	import EnrolledEventFooter from '$lib/components/EnrolledEventFooter.svelte';
	import NextEventTicket from '$lib/components/NextEventTicket.svelte';
	import TicketDialog from '$lib/components/TicketDialog.svelte';
	import UnsubscribeDialog from '$lib/components/UnsubscribeDialog.svelte';
	import { alertsApi, myRegistrationsApi, publicEventsApi } from '$lib/services/api';
	import { getEventCategoryMeta } from '$lib/catalogs/eventCategories';
	import { getEventCategoryIcon } from '$lib/catalogs/eventCategoryIcons';
	import { isPastEvent, nearestDayItems } from '$lib/utils/events.js';
	import { attendancePreview, canRequestUnsubscribe, describeAttendanceProgress } from '$lib/utils/eventSessions.js';
	import { formatEventSchedule, mapEventToCard } from '$lib/utils/eventCards.js';
	import { panelIn, staggerDelay } from '$lib/utils/motion.js';

	import EventDetailSheet from './EventDetailSheet.svelte';

	let sheetOpen = false;
	let selectedEvent = null;
	let registrationsByEventId = {};
	let unsubscribeDialogOpen = false;
	let unsubscribeTarget = null;

	function requestUnsubscribe(evt) {
		if (evt?.secondaryAction !== 'request_unsubscribe' || evt?.secondaryDisabled) return;
		unsubscribeTarget = { id: evt.id, title: evt.title };
		unsubscribeDialogOpen = true;
	}

	async function afterUnsubscribe() {
		sheetOpen = false;
		await loadUpcomingRegisteredEvents();
	}

	async function openEventDetail(item) {
		const currentRegistration = getRegistrationForEvent(item?.id);
		if (currentRegistration) {
			try {
				const refreshed = await publicEventsApi.getEventTicket(item.id);
				registrationsByEventId = {
					...registrationsByEventId,
					[String(item.id)]: {
						...currentRegistration,
						registration: refreshed?.registration || currentRegistration.registration,
						pending_approval: Boolean(refreshed?.pending_approval),
						ticket: refreshed?.ticket || null,
						attendance: refreshed?.attendance ?? currentRegistration.attendance ?? null,
						sessions: Array.isArray(refreshed?.sessions) ? refreshed.sessions : currentRegistration.sessions
					}
				};
			} catch {
				// Keep the state loaded with the page if the refresh is temporarily unavailable.
			}
		}

		const state = getEventSheetState(item);
		selectedEvent = {
			id: item.id,
			coverImageUrl: item.img,
			creditsLabel: item.credits || 'Sin créditos',
			categoryLabel: item.category || 'EVENTO',
			title: item.title,
			dateLabel: 'Fecha',
			timeLabel: item.date || 'Sin fecha',
			locationTitle: 'Ubicación',
			locationSubtitle: item.place || 'Sin ubicación',
			speakerName: 'Organizador',
			speakerRole: item.organizer || 'Sin organizador',
			aboutText: item.description || 'Sin descripción',
			primaryLabel: state.label,
			primaryDisabled: state.disabled,
			primaryAction: state.action,
			availabilityLabel: state.availabilityLabel || item.availabilityLabel || '',
			secondaryLabel: 'Darme de baja',
			secondaryDisabled: !canRequestUnsubscribe(getRegistrationForEvent(item?.id)),
			secondaryAction: 'request_unsubscribe',
			...attendancePreview(getRegistrationForEvent(item?.id))
		};

		sheetOpen = true;
	}

	let nextEventCards = [];
	let nextEventsLoading = false;
	let nextEventsError = '';
	let ticketDialogOpen = false;
	let ticketEventId = null;
	let alertsNews = [];
	let myEventCards = [];

	function normalizeStatus(value) {
		return String(value || '').trim().toLowerCase();
	}

	function isActiveRegistrationStatus(status) {
		const normalized = normalizeStatus(status);
		if (!normalized) return false;
    if (normalized === 'approved' || normalized === 'pending' || normalized === 'cancel_pending') return true;
		if (normalized.includes('reject')) return false;
		if (normalized.includes('cancel')) return false;
		if (normalized.includes('withdraw')) return false;
		return false;
	}

	function getRegistrationForEvent(eventId) {
		return registrationsByEventId?.[String(eventId)] || null;
	}

	function getEventSheetState(item) {
		const entry = getRegistrationForEvent(item?.id);
		const registrationStatus = normalizeStatus(entry?.registration?.status);
		const ticketStatus = normalizeStatus(entry?.ticket?.status);
		const attendanceLabel = describeAttendanceProgress(entry?.attendance);
		const hasPendingSessions = Number(entry?.attendance?.total) > 1 && Number(entry?.attendance?.pending) > 0;

		if (registrationStatus === 'approved' && ticketStatus === 'used' && !hasPendingSessions) {
			return { label: 'Asistencia registrada', disabled: true, action: 'none', availabilityLabel: attendanceLabel };
		}
		if (registrationStatus === 'approved' && entry?.ticket) {
			return { label: null, disabled: true, action: 'none', availabilityLabel: attendanceLabel };
		}
		if (registrationStatus === 'pending') {
			return { label: 'Inscripción pendiente', disabled: true, action: 'none' };
		}
		if (registrationStatus === 'cancel_pending') {
			return { label: 'Baja en revisión', disabled: true, action: 'none' };
		}
		if (isPastEvent(item)) {
			return { label: 'Evento finalizado', disabled: true, action: 'none' };
		}
		if (registrationStatus === 'rejected') {
			return item?.allowsReapply
				? { label: 'Volver a solicitar', disabled: false, action: 'register' }
				: { label: 'Solicitud rechazada', disabled: true, action: 'none' };
		}

		return { label: 'Inscribirse ahora', disabled: false, action: 'register' };
	}

	async function loadUpcomingRegisteredEvents() {
		nextEventsLoading = true;
		nextEventsError = '';

		try {
			let page = 1;
			let totalPages = 1;
			const all = [];

			do {
				const res = await myRegistrationsApi.list({ page, pageSize: 100 });
				const rows = Array.isArray(res?.registrations) ? res.registrations : [];
				all.push(...rows);
				totalPages = Number(res?.pagination?.totalPages || 1) || 1;
				page += 1;
			} while (page <= totalPages);

			registrationsByEventId = all.reduce((acc, entry) => {
				const eventId = entry?.event?.id;
				if (eventId !== undefined && eventId !== null) acc[String(eventId)] = entry;
				return acc;
			}, {});

			const cards = all
				.filter((entry) => isActiveRegistrationStatus(entry?.registration?.status))
				.filter((entry) => !['cancelled', 'ended'].includes(normalizeStatus(entry?.event?.status)))
				.map((entry) => {
					const registrationStatus = normalizeStatus(entry?.registration?.status);
					// Siguiente sesión sin asistencia: si ya registró todas, el evento deja de ser "próximo".
					const nextSession = entry?.attendance?.next_session || null;
					const startsDate = nextSession?.starts_at ? new Date(nextSession.starts_at) : null;
					const startsMs = startsDate && !Number.isNaN(startsDate.getTime()) ? startsDate.getTime() : null;

					return mapEventToCard(entry?.event, {
						date: nextSession
							? formatEventSchedule(nextSession.starts_at, nextSession.ends_at)
							: formatEventSchedule(entry?.event?.starts_at, entry?.event?.ends_at),
						startsMs,
						sortMs: startsMs ?? (new Date(entry?.event?.starts_at).getTime() || 0),
						enrollmentLabel:
							registrationStatus === 'pending'
								? 'Solicitud pendiente'
								: registrationStatus === 'cancel_pending'
									? 'Baja en revisión'
									: describeAttendanceProgress(entry?.attendance) || 'Inscrito',
						canViewTicket: registrationStatus === 'approved' && Boolean(entry?.ticket),
						ticketCode: registrationStatus === 'approved' ? entry?.ticket?.ticket_code || null : null,
						progress: attendancePreview(entry)
					});
				})
				.sort((a, b) => a.sortMs - b.sortMs);

			myEventCards = cards;
			nextEventCards = nearestDayItems(cards, (x) => x.startsMs ?? NaN);
		} catch (e) {
			nextEventsError = e?.message || 'No se pudo cargar tu próximo evento.';
			nextEventCards = [];
			myEventCards = [];
		} finally {
			nextEventsLoading = false;
		}
	}

	function getNewsToneByAlertCategory(category) {
		const normalized = String(category || '').trim().toLowerCase();
		if (
			normalized.includes('urgent') ||
			normalized.includes('urgente') ||
			normalized.includes('error') ||
			normalized.includes('crit')
		) {
			return 'danger';
		}
		if (
			normalized.includes('success') ||
			normalized.includes('ok') ||
			normalized.includes('info')
		) {
			return 'success';
		}
		return 'info';
	}

	function toRelativeFromIso(value) {
		const date = value ? new Date(value) : null;
		if (!date || Number.isNaN(date.getTime())) return 'Reciente';

		const diffMs = Date.now() - date.getTime();
		const diffMinutes = Math.floor(diffMs / (1000 * 60));
		const diffHours = Math.floor(diffMinutes / 60);
		const diffDays = Math.floor(diffHours / 24);

		if (diffMinutes < 1) return 'Ahora';
		if (diffMinutes < 60) return `Hace ${diffMinutes} min`;
		if (diffHours < 24) return `Hace ${diffHours} h`;
		if (diffDays < 7) return `Hace ${diffDays} día${diffDays > 1 ? 's' : ''}`;

		return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
	}

	async function loadAlertsForNews() {
		try {
			const res = await alertsApi.list({ page: 1, pageSize: 5 });
			const rows = Array.isArray(res?.alerts) ? res.alerts : [];
			alertsNews = rows.map((alert) => {
				const categoryMeta = getEventCategoryMeta(alert?.category, 'general');
				return {
				id: `alert-${alert?.id || Math.random()}`,
				icon: 'alert',
				categoryKey: categoryMeta.value || 'general',
				categoryIcon: getEventCategoryIcon(categoryMeta.iconKey),
				categoryLabel: categoryMeta.label,
				categoryClass: categoryMeta.tagClass,
				title: alert?.title || 'Alerta',
				time: toRelativeFromIso(alert?.created_at || alert?.updated_at || alert?.expires_at),
				description: alert?.description || 'Sin descripción',
				tone: getNewsToneByAlertCategory(alert?.category)
				};
			});
		} catch {
			alertsNews = [];
		}
	}

	function openTicketDialog(eventId) {
		if (!eventId) return;
		ticketEventId = eventId;
		ticketDialogOpen = true;
	}

	onMount(() => {
		loadUpcomingRegisteredEvents();
		loadAlertsForNews();
	});
</script>

<div class="mx-auto w-full max-w-screen-xl px-4 pt-6 pb-24 sm:px-6 lg:px-8">
	<!-- Próximo evento -->
	<div class="flex items-center justify-between">
		<h2 class="text-xl font-semibold tracking-tight">Próximo Evento</h2>
		
	</div>

	{#if nextEventsLoading}
		<Card class="mt-4 overflow-hidden rounded-2xl border bg-blue-600 shadow-sm">
			<div class="px-5 py-8 text-sm text-white/90 sm:px-6">Cargando próximos eventos...</div>
		</Card>
	{:else if nextEventsError}
		<Card class="mt-4 overflow-hidden rounded-2xl border bg-red-50 shadow-sm">
			<div class="px-5 py-8 text-sm font-medium text-red-700 sm:px-6">{nextEventsError}</div>
		</Card>
	{:else if !nextEventCards.length}
		<Card class="mt-4 overflow-hidden rounded-2xl border bg-slate-100 shadow-sm">
			<div class="px-5 py-8 text-sm text-slate-600 sm:px-6">No tienes eventos próximos inscritos.</div>
		</Card>
	{:else}
		<div class="mt-4 grid gap-4 md:grid-cols-2" data-testid="next-events">
			{#each nextEventCards as nextEvent, i (nextEvent.id)}
				<NextEventTicket index={i} event={nextEvent} onOpen={() => openEventDetail(nextEvent)} />
			{/each}
		</div>
	{/if}

	<!-- Mis eventos -->
	<div class="mt-8 flex items-center justify-between">
		<h2 class="text-xl font-semibold tracking-tight">Mis eventos</h2>
	</div>

	{#if nextEventsLoading}
		<div class="mt-4 text-sm text-muted-foreground">Cargando tus eventos...</div>
	{:else if !myEventCards.length}
		<div class="mt-4 text-sm text-muted-foreground">Aún no estás inscrito en eventos activos.</div>
	{:else}
		<div class="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="my-events">
			{#each myEventCards as item, i (item.id)}
				<EventCard
					index={i}
					event={item}
					availabilityLabel={item.enrollmentLabel}
					onClick={() => openEventDetail(item)}
				>
					<svelte:fragment slot="footer">
						<EnrolledEventFooter
							attendance={item.progress.attendance}
							canViewTicket={item.canViewTicket}
							onViewTicket={() => openTicketDialog(item.id)}
						/>
					</svelte:fragment>
				</EventCard>
			{/each}
		</div>
	{/if}

	<!-- Noticias y avisos -->
	<div class="mt-8 flex items-center justify-between gap-3">
		<h2 class="text-xl font-semibold tracking-tight">Noticias y Avisos</h2>
		<Button variant="ghost" size="sm" class="rounded-lg" onclick={() => goto('/app/alerts')}>
			Ver todas
		</Button>
	</div>

	<div class="mt-4 space-y-3">
		{#if !alertsNews.length}
			<Card class="rounded-2xl border">
				<CardContent class="p-4 text-sm text-muted-foreground sm:p-5">
					Por ahora no tenemos alertas publicadas.
				</CardContent>
			</Card>
		{:else}
			{#each alertsNews as n, i (n.id)}
				<div in:panelIn|global={{ delay: staggerDelay(i) }}>
					<AlertPreviewCard item={n} />
				</div>
			{/each}
		{/if}
	</div>
</div>

<TicketDialog bind:open={ticketDialogOpen} eventId={ticketEventId} />

<EventDetailSheet bind:open={sheetOpen} event={selectedEvent} onSecondary={requestUnsubscribe} />

<UnsubscribeDialog bind:open={unsubscribeDialogOpen} event={unsubscribeTarget} onDone={afterUnsubscribe} />