<script>
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import EventCard from '$lib/components/EventCard.svelte';
	import EnrolledEventFooter from '$lib/components/EnrolledEventFooter.svelte';
	import TicketDialog from '$lib/components/TicketDialog.svelte';
	import UnsubscribeDialog from '$lib/components/UnsubscribeDialog.svelte';
	import EventDetailSheet from '$lib/pages/EventDetailSheet.svelte';
	import { myRegistrationsApi, publicEventsApi } from '$lib/services/api';
	import {
		SESSION_STATE_META,
		attendancePreview,
		canRequestUnsubscribe,
		buildCalendarMonth,
		describeAttendanceProgress,
		sessionDisplayState
	} from '$lib/utils/eventSessions.js';
	import { formatEventSchedule, mapEventToCard, resolveEventImage } from '$lib/utils/eventCards.js';
	import { panelIn } from '$lib/utils/motion.js';
	import { ChevronLeft, ChevronRight } from 'lucide-svelte';

	const WEEKDAY_HEADERS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
	const LEGEND = ['attended', 'missed', 'in_progress', 'upcoming', 'pending', 'available', 'cancelled'];
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
	let unsubscribeDialogOpen = false;
	let unsubscribeTarget = null;
	// El calendario también sirve para explorar: por defecto incluye eventos sin inscripción.
	let showAvailable = true;
	let registering = false;

	function isEnrolled(event) {
		return Boolean(event?.registration_status);
	}

	function hasOpenSession(event) {
		return (event?.sessions || []).some((session) => new Date(session.ends_at) > now);
	}

	function availabilityText(event) {
		if (!hasOpenSession(event)) return 'Evento finalizado';
		const capacity = Number(event?.capacity) || 0;
		if (event?.capacity_enabled && capacity > 0) {
			const taken = Number(event?.registrations_count) || 0;
			return `Inscritos: ${taken} · Disponibles: ${Math.max(capacity - taken, 0)}`;
		}
		return 'Disponible para inscripción';
	}

	function isFull(event) {
		const capacity = Number(event?.capacity) || 0;
		return Boolean(event?.capacity_enabled) && capacity > 0 && (Number(event?.registrations_count) || 0) >= capacity;
	}

	async function registerFromSheet(evt) {
		if (registering || !evt?.id) return;
		registering = true;
		selectedEvent = { ...selectedEvent, primaryDisabled: true, primaryLabel: 'Inscribiendo...' };
		try {
			const res = await publicEventsApi.registerToEvent(evt.id, {});
			toast.success(res?.message || 'Inscripción enviada correctamente.');
			sheetOpen = false;
			await loadCalendar();
		} catch (error) {
			toast.error(error?.message || 'No se pudo completar la inscripción.');
			selectedEvent = { ...selectedEvent, primaryDisabled: false, primaryLabel: 'Inscribirse ahora' };
		} finally {
			registering = false;
		}
	}

	function handleSheetPrimary(evt) {
		if (evt?.primaryAction === 'view_ticket') openTicket(evt.id);
		if (evt?.primaryAction === 'register') registerFromSheet(evt);
	}

	function requestUnsubscribe(evt) {
		if (evt?.secondaryAction !== 'request_unsubscribe' || evt?.secondaryDisabled) return;
		unsubscribeTarget = { id: evt.id, title: evt.title };
		unsubscribeDialogOpen = true;
	}

	async function afterUnsubscribe() {
		sheetOpen = false;
		await loadCalendar();
	}

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
		if (!isEnrolled(event)) return availabilityText(event);
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
	function calendarPreview(event) {
		return attendancePreview({ registration: { status: event.registration_status }, event, attendance: event.attendance, sessions: event.sessions });
	}

	function calendarProgress(event) {
		return calendarPreview(event).attendance;
	}

	function openEventSheet(event) {
		const card = eventCard(event);
		const enrolled = event.registration_status === 'approved' && event.status !== 'cancelled';
		const canRegister = !isEnrolled(event) && hasOpenSession(event) && !isFull(event);
		const primary = canViewTicket(event)
			? { primaryLabel: 'Ver ticket', primaryDisabled: false, primaryAction: 'view_ticket' }
			: canRegister
				? { primaryLabel: 'Inscribirse ahora', primaryDisabled: false, primaryAction: 'register' }
				: { primaryLabel: enrolled ? null : isFull(event) ? 'Sin cupo' : enrollmentLabel(event), primaryDisabled: true, primaryAction: 'none' };
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
			// En la agenda móvil no hay pie de tarjeta: el ticket se abre desde la vista previa.
			...primary,
			secondaryLabel: isEnrolled(event) ? 'Darme de baja' : null,
			secondaryDisabled: !canRequestUnsubscribe({ registration: { status: event.registration_status }, event, attendance: event.attendance }),
			secondaryAction: 'request_unsubscribe',
			availabilityLabel: isEnrolled(event) ? describeAttendanceProgress(event.attendance) : availabilityText(event),
			...calendarPreview(event)
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

	$: visibleEvents = showAvailable ? events : events.filter(isEnrolled);
	$: sessionsByDate = visibleEvents.reduce((map, event) => {
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
	$: monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
	$: agendaDays = [...sessionsByDate.keys()]
		.filter((date) => date.startsWith(monthPrefix))
		.sort()
		.map((date) => ({ date, entries: sortedEntries(sessionsByDate, date) }));
	$: selectedHasSessions = Boolean(selectedDate) && sessionsByDate.has(selectedDate);
	function sortedEntries(byDate, date) {
		return [...(byDate.get(date) || [])].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
	}

	function cellImages(entries) {
		const urls = [];
		for (const entry of entries) {
			const style = backgroundImage(resolveEventImage(entry.event));
			if (style && !urls.includes(style)) urls.push(style);
		}
		return urls.slice(0, MAX_CELL_IMAGES);
	}

	function openDay(date) {
		selectedDate = date;
		dayDialogOpen = true;
	}

	function sessionTime(value) {
		return new Date(value).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
	}

	function agendaDayLabel(date) {
		return new Date(`${date}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' });
	}

	// En móvil el día no abre un diálogo: lleva a su grupo dentro de la agenda.
	function selectAgendaDay(date) {
		selectedDate = date;
		document.getElementById(`agenda-${date}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	let touchStartX = null;
	function onSwipeStart(touchEvent) {
		touchStartX = touchEvent.touches[0]?.clientX ?? null;
	}
	function onSwipeEnd(touchEvent) {
		if (touchStartX === null) return;
		const dx = (touchEvent.changedTouches[0]?.clientX ?? touchStartX) - touchStartX;
		touchStartX = null;
		if (Math.abs(dx) > 50) shiftMonth(dx < 0 ? 1 : -1);
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
	<!-- Móvil: mes compacto (desliza para cambiar de mes) y agenda por día. -->
	<section class="space-y-3 px-3 pt-3 pb-24 md:hidden" data-testid="calendar-mobile">
		<div class="flex items-center justify-between gap-2">
			<button type="button" class="grid h-10 w-10 place-items-center rounded-full hover:bg-white" aria-label="Mes anterior" onclick={() => shiftMonth(-1)}>
				<ChevronLeft class="h-5 w-5" />
			</button>
			<div class="text-center">
				<div class="text-base font-semibold first-letter:uppercase" aria-live="polite">{monthTitle}</div>
				{#if loading}<div class="text-[11px] text-muted-foreground">Cargando…</div>{/if}
			</div>
			<div class="flex items-center gap-1">
				<button type="button" class="rounded-full border bg-white px-3 py-1 text-xs font-semibold text-blue-700" onclick={goToday}>Hoy</button>
				<button type="button" class="grid h-10 w-10 place-items-center rounded-full hover:bg-white" aria-label="Mes siguiente" onclick={() => shiftMonth(1)}>
					<ChevronRight class="h-5 w-5" />
				</button>
			</div>
		</div>

		<div class="flex justify-center">
			<div class="inline-flex rounded-full border bg-white p-0.5 text-xs font-semibold" role="group" aria-label="Eventos mostrados">
				<button type="button" aria-pressed={showAvailable} class={`rounded-full px-4 py-1.5 ${showAvailable ? 'bg-blue-600 text-white' : 'text-slate-600'}`} onclick={() => (showAvailable = true)}>Todos</button>
				<button type="button" aria-pressed={!showAvailable} class={`rounded-full px-4 py-1.5 ${!showAvailable ? 'bg-blue-600 text-white' : 'text-slate-600'}`} onclick={() => (showAvailable = false)}>Mis eventos</button>
			</div>
		</div>

		{#if loadError}
			<div class="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{loadError}</div>
		{/if}

		<div
			class="rounded-2xl border bg-white p-2 shadow-sm"
			role="group"
			aria-label="Mes; desliza a los lados para cambiar de mes"
			ontouchstart={onSwipeStart}
			ontouchend={onSwipeEnd}
		>
			<div class="grid grid-cols-7 text-center text-[11px] font-semibold text-muted-foreground" aria-hidden="true">
				{#each WEEKDAY_HEADERS as header}<div class="py-1">{header.slice(0, 1)}</div>{/each}
			</div>
			{#key `${year}-${month}`}
				<div class="grid grid-cols-7 gap-y-1" in:panelIn={{ x: 24 * monthDirection, y: 0 }}>
					{#each weeks as week}
						{#each week as day (day.date)}
							{@const entries = sortedEntries(sessionsByDate, day.date)}
							<button
								type="button"
								class={`mx-auto flex h-11 w-11 flex-col items-center justify-center gap-0.5 rounded-full text-sm transition ${
									day.date === selectedDate
										? 'bg-blue-600 font-semibold text-white'
										: day.date === todayKey
											? 'font-semibold text-blue-700 ring-2 ring-blue-600'
											: day.inMonth
												? day.date < todayKey ? 'text-slate-400' : 'text-slate-800'
												: 'text-slate-300'
								}`}
								aria-label={`${day.date}${entries.length ? `, ${entries.length} sesión(es)` : ''}`}
								aria-pressed={day.date === selectedDate}
								data-agenda-date={day.date}
								onclick={() => selectAgendaDay(day.date)}
							>
								<span class="leading-none">{day.day}</span>
								<span class="flex h-1.5 gap-0.5">
									{#each entries.slice(0, 3) as entry (entry.id)}
										<span class={`h-1.5 w-1.5 rounded-full ${day.date === selectedDate ? 'bg-white' : (SESSION_STATE_META[entry.displayState] || SESSION_STATE_META.upcoming).dot}`}></span>
									{/each}
								</span>
							</button>
						{/each}
					{/each}
				</div>
			{/key}
		</div>

		<div class="flex flex-wrap gap-x-3 gap-y-1 px-1 text-[11px] text-muted-foreground">
			{#each LEGEND as state}
				<span class="flex items-center gap-1">
					<span class={`h-2 w-2 rounded-full ${SESSION_STATE_META[state].dot}`}></span>
					{SESSION_STATE_META[state].label}
				</span>
			{/each}
		</div>

		{#if selectedDate && !selectedHasSessions}
			<div class="rounded-xl border border-dashed bg-white px-4 py-3 text-center text-sm text-muted-foreground">
				Sin eventos el <span class="first-letter:uppercase">{agendaDayLabel(selectedDate)}</span>.
			</div>
		{/if}

		{#if !loading && !agendaDays.length}
			<div class="rounded-xl border border-dashed bg-white px-4 py-8 text-center text-sm text-muted-foreground">
				No tienes sesiones este mes.
			</div>
		{/if}

		<ol class="space-y-4" data-testid="calendar-agenda">
			{#each agendaDays as group (group.date)}
				<li id={`agenda-${group.date}`} class="scroll-mt-20">
					<div class={`mb-2 flex items-center gap-2 text-sm font-semibold first-letter:uppercase ${group.date < todayKey ? 'text-slate-400' : 'text-slate-800'}`}>
						<span class="first-letter:uppercase">{agendaDayLabel(group.date)}</span>
						{#if group.date === todayKey}<span class="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">Hoy</span>{/if}
					</div>
					<ol class="space-y-2 border-l-2 border-slate-200 pl-4">
						{#each group.entries as entry (entry.id)}
							{@const meta = SESSION_STATE_META[entry.displayState] || SESSION_STATE_META.upcoming}
							{@const ended = new Date(entry.ends_at) < now}
							<li class="relative" data-testid="agenda-session">
								<span class={`absolute -left-[23px] top-4 h-3 w-3 rounded-full ring-2 ring-white ${meta.dot}`}></span>
								<button
									type="button"
									class={`flex w-full items-center gap-3 rounded-2xl border bg-white p-2 text-left shadow-sm transition active:scale-[0.99] ${ended ? 'opacity-70' : ''}`}
									onclick={() => openEventSheet(entry.event)}
								>
									<img
										src={resolveEventImage(entry.event)}
										alt=""
										class={`h-16 w-20 shrink-0 rounded-xl object-cover ${ended ? 'grayscale' : ''}`}
										loading="lazy"
									/>
									<div class="min-w-0 flex-1">
										<div class="text-xs font-semibold text-blue-700">{sessionTime(entry.starts_at)} – {sessionTime(entry.ends_at)}</div>
										<div class="truncate text-sm font-semibold">{entry.event.title}</div>
										<div class="truncate text-xs text-muted-foreground">{entry.event.location || 'Sin ubicación'}</div>
										<div class="mt-1 flex flex-wrap gap-1">
											<span class={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${meta.className}`}>{meta.label}</span>
											{#if entry.event.sessions.length > 1}
												<span class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">Sesión {entry.index} de {entry.event.sessions.length}</span>
											{/if}
										</div>
									</div>
								</button>
							</li>
						{/each}
					</ol>
				</li>
			{/each}
		</ol>
	</section>

	<section class="hidden h-[calc(100dvh-64px)] min-h-[520px] flex-col gap-2 px-2 pt-3 pb-2 sm:px-4 md:flex lg:h-[100dvh] lg:px-6 lg:pt-5">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<div class="flex flex-wrap items-center gap-3">
				<h2 class="text-xl font-semibold tracking-tight">Mi calendario</h2>
				<div class="inline-flex rounded-full border bg-white p-0.5 text-xs font-semibold" role="group" aria-label="Eventos mostrados">
					<button type="button" aria-pressed={showAvailable} class={`rounded-full px-3 py-1 ${showAvailable ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`} onclick={() => (showAvailable = true)}>Todos</button>
					<button type="button" aria-pressed={!showAvailable} class={`rounded-full px-3 py-1 ${!showAvailable ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`} onclick={() => (showAvailable = false)}>Mis eventos</button>
				</div>
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
					{@const past = day.date < todayKey}
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
							<div class={`absolute inset-0 scale-110 bg-cover bg-center blur-md ${past ? 'grayscale' : ''}`} style={images[0]}></div>
							<div class={`absolute inset-0 bg-contain bg-center bg-no-repeat ${past ? 'grayscale' : ''}`} style={images[0]}></div>
							<div class="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-black/30"></div>
						{:else if images.length}
							<div class={`absolute inset-0 flex ${past ? 'grayscale' : ''}`}>
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
</div>

<Dialog.Root bind:open={dayDialogOpen}>
	<Dialog.Content class="max-h-[85dvh] w-[min(94vw,560px)] overflow-y-auto overflow-x-hidden rounded-2xl p-0" data-testid="calendar-day-dialog">
		<div class="min-w-0 space-y-3 p-5">
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
									attendance={calendarProgress(entry.event)}
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

<EventDetailSheet
	bind:open={sheetOpen}
	event={selectedEvent}
	onPrimary={handleSheetPrimary}
	onSecondary={requestUnsubscribe}
/>

<UnsubscribeDialog bind:open={unsubscribeDialogOpen} event={unsubscribeTarget} onDone={afterUnsubscribe} />

<TicketDialog bind:open={ticketDialogOpen} eventId={ticketEventId} />
