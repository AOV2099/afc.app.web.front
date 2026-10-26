<script>
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { ScrollArea, Scrollbar } from '$lib/components/ui/scroll-area';
	import AlertPreviewCard from '$lib/components/alerts/AlertPreviewCard.svelte';
	import EventCard from '$lib/components/EventCard.svelte';
	import EnrolledEventFooter from '$lib/components/EnrolledEventFooter.svelte';
	import TicketDialog from '$lib/components/TicketDialog.svelte';
	import { alertsApi, myRegistrationsApi, publicEventsApi } from '$lib/services/api';
	import { getEventCategoryMeta } from '$lib/catalogs/eventCategories';
	import { getEventCategoryIcon } from '$lib/catalogs/eventCategoryIcons';
	import {
		isPastEvent,
		isVisibleToUser
	} from '$lib/utils/events.js';
	import { attendancePreview, describeAttendanceProgress } from '$lib/utils/eventSessions.js';
	import { formatEventSchedule, mapEventToCard } from '$lib/utils/eventCards.js';
	import { panelIn, staggerDelay } from '$lib/utils/motion.js';

	import { ChevronRight } from 'lucide-svelte';

	import EventDetailSheet from './EventDetailSheet.svelte';

	let sheetOpen = false;
	let selectedEvent = null;
	let registrationsByEventId = {};

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
	let recommendedEvents = [];
	let recommendedLoading = false;
	let recommendedError = '';
	let registeringFromSheet = false;

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

	function toDayKey(date) {
		if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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

			const candidates = all
				.filter((entry) => isActiveRegistrationStatus(entry?.registration?.status))
				.filter((entry) => !['cancelled', 'ended'].includes(normalizeStatus(entry?.event?.status)))
				.map((entry) => {
					const registrationStatus = normalizeStatus(entry?.registration?.status);
					// Siguiente sesión sin asistencia: si ya registró todas, el evento deja de ser "próximo".
					const nextSession = entry?.attendance?.next_session || null;
					const startsDate = nextSession?.starts_at ? new Date(nextSession.starts_at) : null;
					const startsMs = startsDate && !Number.isNaN(startsDate.getTime()) ? startsDate.getTime() : null;

					return mapEventToCard(entry?.event, {
						date: formatEventSchedule(nextSession?.starts_at, nextSession?.ends_at),
						startsMs,
						dayKey: startsDate ? toDayKey(startsDate) : '',
						enrollmentLabel:
							registrationStatus === 'pending'
								? 'Solicitud pendiente'
								: registrationStatus === 'cancel_pending'
									? 'Baja en revisión'
									: describeAttendanceProgress(entry?.attendance) || 'Inscrito',
						canViewTicket: registrationStatus === 'approved' && Boolean(entry?.ticket)
					});
				})
				.filter((x) => Number.isFinite(x.startsMs))
				.sort((a, b) => a.startsMs - b.startsMs);

			if (!candidates.length) {
				nextEventCards = [];
				return;
			}

			const nearestDayKey = candidates[0].dayKey;
			nextEventCards = candidates.filter((x) => x.dayKey === nearestDayKey);
		} catch (e) {
			nextEventsError = e?.message || 'No se pudo cargar tu próximo evento.';
			nextEventCards = [];
		} finally {
			nextEventsLoading = false;
		}
	}

	function mapEventToRecommendedCard(event) {
		return mapEventToCard(event, {
			availabilityLabel: isPastEvent(event) ? 'Este evento ya finalizó.' : ''
		});
	}

	async function loadRecommendedEvents() {
		recommendedLoading = true;
		recommendedError = '';

		try {
			const now = Date.now();
			const res = await publicEventsApi.listEvents({ page: 1, pageSize: 12 });
			const events = Array.isArray(res?.events) ? res.events : [];
			recommendedEvents = events
				.filter((event) => isVisibleToUser(event, now))
				.map(mapEventToRecommendedCard);
		} catch (e) {
			recommendedEvents = [];
			recommendedError = e?.message || 'No se pudieron cargar los eventos.';
		} finally {
			recommendedLoading = false;
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

	async function registerFromEventSheet(evt) {
		if (registeringFromSheet) return;

		const eventId = Number(evt?.id);
		if (!Number.isInteger(eventId) || eventId <= 0) {
			toast.error('Evento inválido para inscripción.');
			return;
		}

		registeringFromSheet = true;
		if (selectedEvent) {
			selectedEvent = {
				...selectedEvent,
				primaryDisabled: true,
				primaryLabel: 'Inscribiendo...'
			};
		}

		try {
			const res = await publicEventsApi.registerToEvent(eventId, {});
			toast.success(res?.message || 'Inscripción enviada correctamente.');
			sheetOpen = false;
			await Promise.all([loadUpcomingRegisteredEvents(), loadRecommendedEvents()]);
		} catch (error) {
			toast.error(error?.message || 'No se pudo completar la inscripción.');
			if (selectedEvent) {
				selectedEvent = {
					...selectedEvent,
					primaryDisabled: false,
					primaryLabel: 'Inscribirse ahora'
				};
			}
		} finally {
			registeringFromSheet = false;
		}
	}

	async function handleEventSheetPrimary(evt) {
		if (evt?.primaryAction === 'none') return;
		await registerFromEventSheet(evt);
	}

	onMount(() => {
		loadUpcomingRegisteredEvents();
		loadRecommendedEvents();
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
		<div class="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="next-events">
			{#each nextEventCards as nextEvent, i (nextEvent.id)}
				<EventCard
					index={i}
					event={nextEvent}
					availabilityLabel={nextEvent.enrollmentLabel}
					onClick={() => openEventDetail(nextEvent)}
				>
					<svelte:fragment slot="footer">
						<EnrolledEventFooter
							canViewTicket={nextEvent.canViewTicket}
							onViewTicket={() => openTicketDialog(nextEvent.id)}
						/>
					</svelte:fragment>
				</EventCard>
			{/each}
		</div>
	{/if}

	<!-- Recomendados -->
	<div class="mt-8 flex items-center justify-between">
		<h2 class="text-xl font-semibold tracking-tight">Recomendados para ti</h2>
		<Button variant="ghost" size="icon" class="rounded-full" aria-label="Ver más">
			<ChevronRight class="h-5 w-5" />
		</Button>
	</div>

	<ScrollArea class="mt-4 w-full whitespace-nowrap">
		{#if recommendedLoading}
			<div class="pb-3 text-sm text-muted-foreground">Cargando eventos...</div>
		{:else if recommendedError}
			<div class="pb-3 text-sm text-red-600">{recommendedError}</div>
		{:else if !recommendedEvents.length}
			<div class="pb-3 text-sm text-muted-foreground">No hay eventos disponibles por el momento.</div>
		{:else}
			<div class="flex gap-4 pb-3">
				{#each recommendedEvents as r, i (r.id)}
					<EventCard
						index={i}
						event={r}
						variant="carousel"
						availabilityLabel={r.availabilityLabel || null}
						onClick={() => openEventDetail(r)}
					/>
				{/each}
			</div>
		{/if}

		<Scrollbar orientation="horizontal" />
	</ScrollArea>

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

<EventDetailSheet
  bind:open={sheetOpen}
  event={selectedEvent}
	onPrimary={handleEventSheetPrimary}
  />