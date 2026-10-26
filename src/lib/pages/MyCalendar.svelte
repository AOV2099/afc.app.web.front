<script>
	import { onMount } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import EventCard from '$lib/components/EventCard.svelte';
	import EnrolledEventFooter from '$lib/components/EnrolledEventFooter.svelte';
	import TicketDialog from '$lib/components/TicketDialog.svelte';
	import EventDetailSheet from '$lib/pages/EventDetailSheet.svelte';
	import { myRegistrationsApi } from '$lib/services/api';
	import {
		SESSION_STATE_META,
		attendancePreview,
		buildCalendarMonth,
		describeAttendanceProgress,
		sessionDisplayState
	} from '$lib/utils/eventSessions.js';
	import { formatEventSchedule, mapEventToCard } from '$lib/utils/eventCards.js';
	import { panelIn } from '$lib/utils/motion.js';
	import { ChevronLeft, ChevronRight } from 'lucide-svelte';

	const WEEKDAY_HEADERS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
	const LEGEND = ['attended', 'missed', 'in_progress', 'upcoming', 'pending', 'cancelled'];
	const MAX_CELL_IMAGES = 3;

	let loading = true;
	let loadError = '';
	let events = [];

	const now = new Date();
	const todayKey = localDateKey(now);
	let year = now.getFullYear();
	let month = now.getMonth();
	let selectedDate = '';
	let monthDirection = 0;
	let dayDialogOpen = false;
	let sheetOpen = false;
	let selectedEvent = null;
	let ticketDialogOpen = false;
	let ticketEventId = null;

	function localDateKey(value) {
		const date = new Date(value);
		const pad = (n) => String(n).padStart(2, '0');
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
	}

	function canViewTicket(event) {
		return event?.registration_status === 'approved' && event?.status !== 'cancelled' && Boolean(event?.attendance?.next_session);
	}

	function enrollmentLabel(event) {
		if (event?.status === 'cancelled') return 'Evento cancelado';
		if (event?.registration_status === 'pending' || event?.registration_status === 'changes_requested') return 'Solicitud pendiente';
		if (event?.registration_status === 'cancel_pending') return 'Baja en revisión';
		return describeAttendanceProgress(event?.attendance) || 'Inscrito';
	}

	function sessionCard(entry) {
		return mapEventToCard(entry.event, { date: formatEventSchedule(entry.starts_at, entry.ends_at) });
	}

	function eventCard(event) {
		const next = event.attendance?.next_session;
		return mapEventToCard(event, {
			date: next ? formatEventSchedule(next.starts_at, next.ends_at) : formatEventSchedule(event.starts_at, event.ends_at)
		});
	}

	function sessionBadges(entry) {
		const meta = SESSION_STATE_META[entry.displayState] || SESSION_STATE_META.upcoming;
		const badges = [{ label: meta.label, className: `border ${meta.className}` }];
		if (entry.event.sessions.length > 1) badges.push({ label: `Sesión ${entry.index} de ${entry.event.sessions.length}` });
		return badges;
	}

	// Mismo detalle que en Inicio y Explorar; desde el calendario solo se consulta el ticket.
	function openEventSheet(event) {
		const card = eventCard(event);
		const enrolled = event.registration_status === 'approved' && event.status !== 'cancelled';
		selectedEvent = {
			id: event.id,
			coverImageUrl: card.img,
			creditsLabel: card.credits || 'Sin créditos',
			categoryLabel: card.category,
			title: card.title,
			dateLabel: 'Fecha',
			timeLabel: card.date,
			locationTitle: 'Ubicación',
			locationSubtitle: card.place,
			speakerName: 'Organizador',
			speakerRole: card.organizer,
			aboutText: card.description || 'Sin descripción',
			primaryLabel: enrolled ? null : enrollmentLabel(event),
			primaryDisabled: true,
			primaryAction: 'none',
			availabilityLabel: describeAttendanceProgress(event.attendance),
			...attendancePreview({ registration: { status: event.registration_status }, event, attendance: event.attendance, sessions: event.sessions })
		};
		dayDialogOpen = false;
		sheetOpen = true;
	}

	function openTicket(eventId) {
		dayDialogOpen = false;
		sheetOpen = false;
		ticketEventId = eventId;
		ticketDialogOpen = true;
	}

	// Solo URLs http(s); JSON.stringify deja la URL entre comillas y escapada para CSS.
	function backgroundImage(url) {
		return /^https?:\/\//iu.test(String(url || '')) ? `background-image:url(${JSON.stringify(url)})` : '';
	}

	$: sessionsByDate = events.reduce((map, event) => {
		event.sessions.forEach((session, index) => {
			const key = localDateKey(session.starts_at);
			const entry = { ...session, event, index: index + 1, displayState: sessionDisplayState(session, event) };
			map.set(key, [...(map.get(key) || []), entry]);
		});
		return map;
	}, new Map());
	$: weeks = buildCalendarMonth(year, month);
	$: monthTitle = new Date(year, month, 15).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
	$: daySessions = sortedEntries(sessionsByDate, selectedDate);
	$: selectedDateLabel = selectedDate
		? new Date(`${selectedDate}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
		: '';
	$: multiSessionEvents = events.filter(
		(event) => Number(event.attendance?.total) > 1 && event.registration_status === 'approved' && event.status !== 'cancelled'
	);

	// Recibe el mapa como argumento para que las celdas se actualicen al cargar los datos.
	function sortedEntries(byDate, date) {
		return [...(byDate.get(date) || [])].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
	}

	function cellImages(entries) {
		const urls = [];
		for (const entry of entries) {
			const style = backgroundImage(entry.event.cover_image_url);
			if (style && !urls.includes(style)) urls.push(style);
		}
		return urls.slice(0, MAX_CELL_IMAGES);
	}

	function openDay(date) {
		selectedDate = date;
		dayDialogOpen = true;
	}

	function shiftMonth(delta) {
		monthDirection = Math.sign(delta);
		const next = month + delta;
		year += Math.floor(next / 12);
		month = ((next % 12) + 12) % 12;
	}

	function goToday() {
		monthDirection = year * 12 + month <= now.getFullYear() * 12 + now.getMonth() ? 1 : -1;
		year = now.getFullYear();
		month = now.getMonth();
	}

	async function loadCalendar() {
		loading = true;
		loadError = '';
		try {
			const res = await myRegistrationsApi.calendar();
			events = Array.isArray(res?.events) ? res.events : [];
		} catch (error) {
			loadError = error?.message || 'No se pudo cargar tu calendario.';
			events = [];
		} finally {
			loading = false;
		}
	}

	onMount(loadCalendar);
</script>

<div class="w-full" data-testid="my-calendar">
	<section class="flex h-[calc(100dvh-64px)] min-h-[520px] flex-col gap-2 px-2 pt-3 pb-2 sm:px-4 lg:h-[100dvh] lg:px-6 lg:pt-5">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<div class="flex items-center gap-2">
				<h2 class="text-xl font-semibold tracking-tight">Mi calendario</h2>
				{#if loading}<span class="text-xs text-muted-foreground">Cargando…</span>{/if}
			</div>
			<div class="flex items-center gap-1">
				<button type="button" class="grid h-9 w-9 place-items-center rounded-lg hover:bg-white" aria-label="Mes anterior" onclick={() => shiftMonth(-1)}>
					<ChevronLeft class="h-5 w-5" />
				</button>
				<div class="min-w-36 text-center text-base font-semibold first-letter:uppercase" aria-live="polite">{monthTitle}</div>
				<button type="button" class="grid h-9 w-9 place-items-center rounded-lg hover:bg-white" aria-label="Mes siguiente" onclick={() => shiftMonth(1)}>
					<ChevronRight class="h-5 w-5" />
				</button>
				<button type="button" class="ml-1 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50" onclick={goToday}>
					Hoy
				</button>
			</div>
		</div>

		{#if loadError}
			<div class="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{loadError}</div>
		{/if}

		<div class="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-muted-foreground sm:text-xs" aria-hidden="true">
			{#each WEEKDAY_HEADERS as header}<div>{header}</div>{/each}
		</div>

		{#key `${year}-${month}`}
		<div
			class="grid min-h-0 flex-1 grid-cols-7 gap-1 sm:gap-1.5"
			style={`grid-template-rows:repeat(${weeks.length}, minmax(0, 1fr))`}
			in:panelIn={{ x: 24 * monthDirection, y: 0 }}
		>
			{#each weeks as week}
				{#each week as day (day.date)}
					{@const entries = sortedEntries(sessionsByDate, day.date)}
					{@const images = cellImages(entries)}
					<button
						type="button"
						class={`group relative overflow-hidden rounded-lg border text-left transition hover:shadow-md focus-visible:outline-2 focus-visible:outline-blue-600 sm:rounded-xl ${
							images.length ? 'border-transparent' : 'bg-white'
						} ${day.inMonth ? '' : 'opacity-40'} ${day.date === todayKey ? 'ring-2 ring-blue-600' : ''}`}
						aria-label={`${day.date}${entries.length ? `, ${entries.length} sesión(es)` : ''}`}
						data-date={day.date}
						onclick={() => openDay(day.date)}
					>
						{#if images.length === 1}
							<!-- Una sola portada se muestra completa (2:1) sobre una copia desenfocada que rellena la celda. -->
							<div class="absolute inset-0 scale-110 bg-cover bg-center blur-md" style={images[0]}></div>
							<div class="absolute inset-0 bg-contain bg-center bg-no-repeat" style={images[0]}></div>
							<div class="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-black/30"></div>
						{:else if images.length}
							<div class="absolute inset-0 flex">
								{#each images as style}
									<div class="h-full flex-1 bg-cover bg-center transition group-hover:scale-105" style={style}></div>
								{/each}
							</div>
							<div class="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-black/20"></div>
						{/if}
						<div class={`relative flex h-full flex-col justify-between p-1 sm:p-2 ${images.length ? 'text-white' : 'text-slate-800'}`}>
							<span
								class={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold sm:text-sm ${
									day.date === todayKey ? 'bg-blue-600 text-white' : ''
								}`}
							>
								{day.day}
							</span>
							{#if entries.length}
								<div class="space-y-0.5">
									{#each entries.slice(0, 2) as entry (entry.id)}
										<div class="hidden truncate text-[11px] font-semibold leading-tight md:block">{entry.event.title}</div>
									{/each}
									<div class="flex flex-wrap gap-0.5 sm:gap-1">
										{#each entries.slice(0, 4) as entry (entry.id)}
											<span
												class={`h-2 w-2 rounded-full ring-1 ring-white/70 ${(SESSION_STATE_META[entry.displayState] || SESSION_STATE_META.upcoming).dot}`}
											></span>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					</button>
				{/each}
			{/each}
		</div>
		{/key}

		<div class="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
			{#each LEGEND as state}
				<span class="flex items-center gap-1">
					<span class={`h-2 w-2 rounded-full ${SESSION_STATE_META[state].dot}`}></span>
					{SESSION_STATE_META[state].label}
				</span>
			{/each}
		</div>
	</section>

	{#if multiSessionEvents.length}
		<section class="space-y-3 px-2 pt-4 pb-24 sm:px-4 lg:px-6 lg:pb-8">
			<h3 class="text-lg font-semibold tracking-tight">Avance en eventos de varias sesiones</h3>
			<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				{#each multiSessionEvents as event, i (event.id)}
					<div class="flex" data-testid="calendar-event-progress">
						<EventCard index={i} event={eventCard(event)} availabilityLabel={enrollmentLabel(event)} onClick={() => openEventSheet(event)}>
							<svelte:fragment slot="footer">
								<EnrolledEventFooter
									canViewTicket={canViewTicket(event)}
									onViewTicket={() => openTicket(event.id)}
								/>
							</svelte:fragment>
						</EventCard>
					</div>
				{/each}
			</div>
		</section>
	{/if}
</div>

<Dialog.Root bind:open={dayDialogOpen}>
	<Dialog.Content class="max-h-[85dvh] w-[min(94vw,560px)] overflow-y-auto rounded-2xl p-0" data-testid="calendar-day-dialog">
		<div class="space-y-3 p-5">
			<Dialog.Title class="text-lg font-semibold first-letter:uppercase">{selectedDateLabel}</Dialog.Title>
			{#if !daySessions.length}
				<div class="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
					Sin eventos este día.
				</div>
			{:else}
				{#each daySessions as entry, i (entry.id)}
					<div data-testid="calendar-session">
						<EventCard
							index={i}
							event={sessionCard(entry)}
							badges={sessionBadges(entry)}
							availabilityLabel={enrollmentLabel(entry.event)}
							onClick={() => openEventSheet(entry.event)}
						>
							<svelte:fragment slot="footer">
								<EnrolledEventFooter
									canViewTicket={canViewTicket(entry.event) && ['upcoming', 'in_progress'].includes(entry.displayState)}
									onViewTicket={() => openTicket(entry.event.id)}
								/>
							</svelte:fragment>
						</EventCard>
					</div>
				{/each}
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>

<EventDetailSheet bind:open={sheetOpen} event={selectedEvent} />

<TicketDialog bind:open={ticketDialogOpen} eventId={ticketEventId} />
