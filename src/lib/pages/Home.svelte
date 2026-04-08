<script>
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { toPng } from 'html-to-image';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { ScrollArea, Scrollbar } from '$lib/components/ui/scroll-area';
	import { Separator } from '$lib/components/ui/separator';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import AlertPreviewCard from '$lib/components/alerts/AlertPreviewCard.svelte';
	import { alertsApi, myRegistrationsApi, publicEventsApi } from '$lib/services/api';
	import { createTicketQrDataUrl } from '$lib/services/qrCodeService';
	import { getEventCategoryMeta } from '$lib/catalogs/eventCategories';
	import { getEventCategoryIcon } from '$lib/catalogs/eventCategoryIcons';

	import {
		Bell,
		CalendarDays,
		MapPin,
		Ticket,
		ChevronRight,
		Calendar,
		Download
	} from 'lucide-svelte';

	import EventDetailSheet from './EventDetailSheet.svelte';

	let sheetOpen = false;
	let selectedEvent = null;

	function openEventDetail(item) {
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
			primaryLabel: 'Inscribirse ahora',
			availabilityLabel: item.availabilityLabel || ''
		};

		sheetOpen = true;
	}

	let nextEventCards = [];
	let nextEventsLoading = false;
	let nextEventsError = '';
	let ticketDialogOpen = false;
	let ticketLoading = false;
	let ticketError = '';
	let selectedTicket = null;
	let ticketCaptureContainer;
	let alertsNews = [];
	let recommendedEvents = [];
	let recommendedLoading = false;
	let recommendedError = '';

	const EVENT_IMAGE_FALLBACK =
		'https://gaceta.cch.unam.mx/sites/default/files/styles/imagen_articulos_1920x1080/public/2020-07/video_mensaje_1.jpg?h=d1cb525d&itok=4PYz5F61';

	function normalizeStatus(value) {
		return String(value || '').trim().toLowerCase();
	}

	function isUsedTicketStatus(value) {
		return normalizeStatus(value) === 'used';
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

	function toDayKey(date) {
		if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
	}

	function formatEventDateLabel(startsAt, endsAt) {
		const starts = startsAt ? new Date(startsAt) : null;
		const ends = endsAt ? new Date(endsAt) : null;

		if (!starts || Number.isNaN(starts.getTime())) return 'Sin fecha';

		const dayLabel = starts.toLocaleDateString('es-MX', {
			weekday: 'long',
			day: '2-digit',
			month: 'long'
		});

		const startHour = starts.toLocaleTimeString('es-MX', {
			hour: '2-digit',
			minute: '2-digit'
		});

		if (ends && !Number.isNaN(ends.getTime())) {
			const endHour = ends.toLocaleTimeString('es-MX', {
				hour: '2-digit',
				minute: '2-digit'
			});
			return `${dayLabel} · ${startHour} - ${endHour}`;
		}

		return `${dayLabel} · ${startHour}`;
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

			const now = Date.now();
			const candidates = all
				.filter((entry) => isActiveRegistrationStatus(entry?.registration?.status))
				.map((entry) => {
					const event = entry?.event || {};
					const registrationStatus = normalizeStatus(entry?.registration?.status);
					const ticketStatus = normalizeStatus(entry?.ticket?.status);
					const startsDate = event?.starts_at ? new Date(event.starts_at) : null;
					const startsMs = startsDate && !Number.isNaN(startsDate.getTime()) ? startsDate.getTime() : null;

					return {
						id: `${entry?.registration?.id || 'reg'}-${event?.id || 'evt'}`,
						eventId: event?.id,
						startsMs,
						dayKey: startsDate ? toDayKey(startsDate) : '',
						category: event?.registration_mode === 'manual_review' ? 'Revisión manual' : 'Inscripción activa',
						title: event?.title || 'Evento sin título',
						description: event?.description || 'Evento en el que estás inscrito.',
						date: formatEventDateLabel(event?.starts_at, event?.ends_at),
						startsAt: event?.starts_at || null,
						location: event?.location || 'Ubicación por confirmar',
						registrationStatus,
						ticketStatus,
						ticketUsed: isUsedTicketStatus(ticketStatus)
					};
				})
				.filter((x) => Number.isFinite(x.startsMs) && x.startsMs >= now)
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

	function resolveEventImage(event) {
		return (
			event?.coverImageUrl ||
			event?.cover_image_url ||
			event?.image ||
			event?.image_url ||
			event?.cover_url ||
			event?.attributes?.cover_image_url ||
			event?.attributes?.image_url ||
			EVENT_IMAGE_FALLBACK
		);
	}

	function mapEventToRecommendedCard(event) {
		const startsAt = event?.starts_at ? new Date(event.starts_at) : null;
		const categoryMeta = getEventCategoryMeta(event?.category || 'general');
		const startsLabel =
			startsAt && !Number.isNaN(startsAt.getTime())
				? startsAt.toLocaleString('es-MX', {
						day: '2-digit',
						month: 'short',
						hour: '2-digit',
						minute: '2-digit'
					})
				: 'Sin fecha';

		return {
			id: event?.id,
			category: categoryMeta.label.toUpperCase(),
			categoryClass: categoryMeta.tagClass,
			title: event?.title || 'Evento sin título',
			date: startsLabel,
			img: resolveEventImage(event),
			credits: event?.hours_value ? `${event.hours_value} Hrs.` : null,
			place: event?.location || event?.attributes?.location || 'Sin ubicación',
			organizer: event?.organizer || event?.attributes?.organizer || 'Sin organizador',
			description: event?.description || '',
			availabilityLabel: ''
		};
	}

	async function loadRecommendedEvents() {
		recommendedLoading = true;
		recommendedError = '';

		try {
			const res = await publicEventsApi.listEvents({ page: 1, pageSize: 12 });
			const events = Array.isArray(res?.events) ? res.events : [];
			recommendedEvents = events.map(mapEventToRecommendedCard);
		} catch (e) {
			recommendedEvents = [];
			recommendedError = e?.message || 'No se pudieron cargar los eventos.';
		} finally {
			recommendedLoading = false;
		}
	}

	function formatTicketDate(value) {
		if (!value) return 'Sin fecha';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'Sin fecha';
		return date.toLocaleString('es-MX', {
			day: '2-digit',
			month: 'long',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
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

	async function openTicketDialog(nextEvent) {
		if (!nextEvent?.eventId) return;

		ticketDialogOpen = true;
		ticketLoading = true;
		ticketError = '';
		selectedTicket = null;

		try {
			const res = await publicEventsApi.getEventTicket(nextEvent.eventId);
			const ticketCode = res?.ticket?.ticket_code || 'Sin código';
			const qrDataUrl = ticketCode && ticketCode !== 'Sin código' ? await createTicketQrDataUrl(ticketCode) : null;

			selectedTicket = {
				eventTitle: res?.event?.title || nextEvent?.title || 'Evento',
				eventDate: formatTicketDate(res?.event?.starts_at || nextEvent?.startsAt),
				ticketCode,
				qrDataUrl
			};
		} catch (error) {
			ticketError = error?.message || 'No se pudo consultar el ticket.';
		} finally {
			ticketLoading = false;
		}
	}

	async function downloadTicketImage() {
		if (!ticketCaptureContainer || !selectedTicket) return;

		try {
			const dataUrl = await toPng(ticketCaptureContainer, {
				cacheBust: true,
				pixelRatio: 2,
				backgroundColor: '#ffffff'
			});

			const eventTitle = String(selectedTicket?.eventTitle || 'evento')
				.toLowerCase()
				.replace(/[^a-z0-9]+/gi, '-')
				.replace(/(^-|-$)/g, '') || 'evento';

			const link = document.createElement('a');
			link.download = `ticket-${eventTitle}.png`;
			link.href = dataUrl;
			link.click();
		} catch {
			// noop	
		}
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
		{#each nextEventCards as nextEvent (nextEvent.id)}
			<Card class="mt-4 overflow-hidden rounded-2xl border bg-blue-600 shadow-sm">
				<div class="relative px-5 py-1 text-white sm:px-6">
					<div class="flex items-start justify-between gap-4">
						<span class="inline-flex items-center rounded-xl bg-white/20 px-3 py-1 text-xs font-medium">
							{nextEvent.category}
						</span>

						<button
							type="button"
							class="grid h-10 w-10 place-items-center rounded-xl bg-white/15 hover:bg-white/20"
							aria-label="Recordatorio"
						>
							<Bell class="h-5 w-5" />
						</button>
					</div>

					<div class="mt-5 text-3xl leading-tight font-semibold sm:text-4xl">
						{nextEvent.title}
					</div>

					<div class="mt-3 max-w-xl text-sm leading-relaxed text-white/90 sm:text-base">
						{nextEvent.description}
					</div>

					<div class="mt-5 space-y-2 text-sm text-white/95">
						<div class="flex items-center gap-2">
							<CalendarDays class="h-4 w-4" />
							<span>{nextEvent.date}</span>
						</div>
						<div class="flex items-center gap-2">
							<MapPin class="h-4 w-4" />
							<span>{nextEvent.location}</span>
						</div>
					</div>

					<Separator class="my-5 bg-white/25" />

					<!--center button-->
					<div class="flex justify-center ">
						{#if nextEvent.ticketUsed}
							<div class="w-full rounded-xl bg-white/15 px-4 py-3 text-center text-sm font-medium text-white/95">
								Este ticket ya ha sido registrado.
							</div>
						{:else}
							<Button
								variant="secondary"
								class="w-full rounded-xl bg-white text-blue-700 hover:bg-white/90"
								onclick={() => openTicketDialog(nextEvent)}
							>
								<Ticket class="mr-2 h-4 w-4" />
								Ver Ticket
							</Button>
						{/if}
					</div>
				</div>
			</Card>
		{/each}
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
				{#each recommendedEvents as r (r.id)}
					<Card
						onclick={() => openEventDetail(r)}
						class="w-[260px] overflow-hidden rounded-2xl border pt-0 sm:w-[290px]"
					>
						<div
							class="relative h-32 w-full bg-muted"
							style={`background-image:url('${r.img}');background-size:cover;background-position:center;`}
						>
							<div class="absolute top-3 left-3">
								<span
									class={`inline-flex items-center rounded-lg px-2 py-1 text-[11px] font-semibold ${r.categoryClass}`}
								>
									{r.category}
								</span>
							</div>
						</div>

						<CardContent class="space-y-2 p-4">
							<div class="text-base leading-tight font-semibold">{r.title}</div>
							<div class="flex items-center gap-2 text-sm text-muted-foreground">
								<CalendarDays class="h-4 w-4" />
								<span>{r.date}</span>
							</div>
						</CardContent>
					</Card>
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
			{#each alertsNews as n (n.id)}
				<AlertPreviewCard item={n} />
			{/each}
		{/if}
	</div>
</div>

<Dialog.Root bind:open={ticketDialogOpen}>
	<Dialog.Content class="mx-auto w-max rounded-3xl p-0">
		<div class="px-6 pt-6 text-center">
			<div class=" mb-4 h-1.5 w-12 rounded-full bg-muted"></div>
			<h3 class="text-2xl font-semibold">Ticket de Asistencia</h3>
		</div>

		<div bind:this={ticketCaptureContainer} class="px-6 py-6">
			{#if ticketLoading}
				<div class="mx-auto flex h-56 w-56 items-center justify-center rounded-2xl bg-blue-50 text-sm text-muted-foreground">
					Cargando ticket...
				</div>
			{:else if ticketError}
				<div class="mx-auto flex h-56 w-56 items-center justify-center rounded-2xl bg-red-50 px-4 text-center text-sm text-red-700">
					{ticketError}
				</div>
			{:else}
				<div class="mx-auto flex h-56 w-56 items-center justify-center rounded-2xl bg-blue-50">
					{#if selectedTicket?.qrDataUrl}
						<img
							src={selectedTicket.qrDataUrl}
							alt={`QR ticket ${selectedTicket?.ticketCode || ''}`}
							class="h-48 w-48 rounded-md object-contain"
						/>
					{:else}
						<div class="px-4 text-center text-sm text-muted-foreground">Sin código QR disponible.</div>
					{/if}
				</div>

				<div class="mt-6 text-center">
					<h4 class="text-lg font-semibold">{selectedTicket?.eventTitle || 'Evento'}</h4>
					<p class="mt-1 text-sm text-muted-foreground">{selectedTicket?.eventDate || 'Sin fecha'}</p>
				</div>

				<p class="mt-6 text-center text-sm text-muted-foreground">
					Presenta este QR al staff del evento para registrar tu asistencia automáticamente.
				</p>
			{/if}
		</div>

		<div class="px-6 pb-6 grid grid-cols-2 gap-3">
			<Dialog.Close asChild>
				<Button variant="secondary" class="w-full rounded-md">Cerrar</Button>
			</Dialog.Close>
			<Button class="w-full rounded-md shadow-sm shadow-blue-200 bg-blue-600" onclick={downloadTicketImage}>
				<Download class="mr-2 h-4 w-4" />
				Descargar
			</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>


<EventDetailSheet
  bind:open={sheetOpen}
  event={selectedEvent}
  onPrimary={(evt) => {
    console.log("Inscribirse a:", evt);
    sheetOpen = false;
  }}
  />