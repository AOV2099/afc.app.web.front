<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { adminEventsApi, adminRequestsApi } from '$lib/services/api';

	import { Bell, CalendarDays, CalendarPlus2, ClipboardList, Eye, QrCode } from 'lucide-svelte';

	const semester = {
		label: 'Ciclo 2024-1',
		updatedAt: 'Actualizado hoy 9:41 AM'
	};

	let loading = false;
	let requestsLoading = false;
	let error = '';
	let events = [];
	let requests = [];

	const statsStyleMap = {
		events: {
			color: 'blue',
			cardClass: 'bg-blue-50/60',
			iconWrapClass: 'bg-blue-100',
			iconClass: 'text-blue-700',
			badgeClass: 'bg-blue-100 text-blue-700 hover:bg-blue-100',
			valueClass: 'text-blue-700'
		},
		pending: {
			color: 'orange',
			cardClass: 'bg-orange-50/60',
			iconWrapClass: 'bg-orange-100',
			iconClass: 'text-orange-700',
			badgeClass: 'bg-orange-100 text-orange-700 hover:bg-orange-100',
			valueClass: 'text-orange-700'
		}
	};

	$: stats = [
		{
			icon: CalendarDays,
			value: Number(events?.length || 0),
			label: 'Eventos Activos',
			style: statsStyleMap.events
		},
		{
			icon: ClipboardList,
			value: Number(requests?.length || 0),
			label: 'Solicitudes Pendientes',
			style: statsStyleMap.pending
		}
	];

	$: upcomingEvents = (Array.isArray(events) ? events : []).map((e) => {
		const startsAt = e?.starts_at ? new Date(e.starts_at) : null;
		const endsAt = e?.ends_at ? new Date(e.ends_at) : null;
		const isValidStart = startsAt && !Number.isNaN(startsAt.getTime());
		const isValidEnd = endsAt && !Number.isNaN(endsAt.getTime());
		const rawCapacity = e?.capacity ?? e?.attributes?.capacity ?? e?.cupo ?? e?.attributes?.cupo;
		const capacityEnabled = e?.capacity_enabled;
		const hasCapacityValue = rawCapacity !== undefined && rawCapacity !== null && rawCapacity !== '';
		const hasCapacity = capacityEnabled === false ? false : hasCapacityValue;
		const capacity = hasCapacity ? Number(rawCapacity) || 0 : 0;
		const registrationsCount =
			Number(
				e?.registrations_count ??
					e?.registration_count ??
					e?.attributes?.registrations_count ??
					e?.attributes?.registration_count ??
					0
			) || 0;
		const availableSpots = hasCapacity ? Math.max(capacity - registrationsCount, 0) : null;
		const availabilityLabel = `Inscritos: ${registrationsCount} · Disponibles: ${
			hasCapacity ? availableSpots : 'Sin límite'
		}`;

		return {
			id: String(e?.id || e?.event_id || Math.random()),
			dateMonth: isValidStart
				? startsAt.toLocaleString('es-MX', { month: 'short' }).toUpperCase()
				: '---',
			dateDay: isValidStart ? String(startsAt.getDate()).padStart(2, '0') : '--',
			title: e?.title || 'Evento',
			time:
				isValidStart && isValidEnd
					? `${startsAt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} - ${endsAt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`
					: 'Sin horario',
			availabilityLabel,
			metaRightTop: e?.status || 'N/A',
			metaRightBottom: 'Estado'
		};
	});

	function getInitials(firstName, lastName, email) {
		const name = `${firstName || ''} ${lastName || ''}`.trim();
		if (name) {
			return name
				.split(/\s+/)
				.slice(0, 2)
				.map((part) => part[0]?.toUpperCase() || '')
				.join('');
		}
		return String(email || '?').slice(0, 2).toUpperCase();
	}

	function formatDateDistance(iso) {
		const d = iso ? new Date(iso) : null;
		if (!d || Number.isNaN(d.getTime())) return null;

		const diffMs = Date.now() - d.getTime();
		const minutes = Math.floor(diffMs / 60000);
		if (minutes < 1) return 'ahora';
		if (minutes < 60) return `${minutes}m`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h`;
		const days = Math.floor(hours / 24);
		return `${days}d`;
	}

	async function loadAdminHome() {
		loading = true;
		error = '';

		try {
			const [eventsRes, pendingRes] = await Promise.all([
				adminEventsApi.listEvents({ page: 1, pageSize: 8 }),
				adminRequestsApi.listPending({ page: 1, pageSize: 5 })
			]);

			events = Array.isArray(eventsRes?.events) ? eventsRes.events : [];
			requests = (Array.isArray(pendingRes?.requests) ? pendingRes.requests : []).map((r) => {
				const firstName = r?.user?.first_name || '';
				const lastName = r?.user?.last_name || '';
				const fullName = `${firstName} ${lastName}`.trim() || r?.user?.email || 'Usuario';
				const requestType = r?.request_type === 'cancellation' ? 'cancellation' : 'registration';

				return {
					id: String(r?.registration_id || ''),
					initials: getInitials(firstName, lastName, r?.user?.email),
					name: fullName,
					career: r?.user?.email || 'Sin correo',
					title: r?.event?.title || 'Solicitud sin evento',
					requestType,
					requestTypeLabel:
						requestType === 'cancellation'
							? 'Solicitud de baja'
							: 'Solicitud de inscripción',
					requestReason: r?.request_detail?.reason || '',
					ago: formatDateDistance(r?.submitted_at),
					priority: r?.request_type === 'cancellation' ? 'BAJA' : 'ALTA'
				};
			});
		} catch (e) {
			error = e?.message || 'No se pudo cargar el inicio de administración.';
		} finally {
			loading = false;
		}
	}

	async function reviewRequest(id, action = 'approve') {
		if (!id) return;
		requestsLoading = true;
		try {
			const res = await adminRequestsApi.review(id, { action });
			toast.success(
				res?.message ||
					(action === 'approve'
						? 'Solicitud aprobada correctamente.'
						: 'Solicitud denegada correctamente.')
			);
			await loadAdminHome();
		} catch (e) {
			const message =
				e?.message ||
				(action === 'approve'
					? 'No se pudo aprobar la solicitud.'
					: 'No se pudo denegar la solicitud.');
			error = message;
			toast.error(message);
		} finally {
			requestsLoading = false;
		}
	}

	async function approve(id) {
		return reviewRequest(id, 'approve');
	}

	async function deny(id) {
		return reviewRequest(id, 'deny');
	}

	function view(id) {
		if (!id) return;
		goto(`/admin/requests?registrationId=${encodeURIComponent(id)}`);
	}

	function openAll() {
		goto('/admin/requests');
	}

	onMount(() => {
		loadAdminHome();
	});
</script>

<!--
	Pantalla Admin:
	- Sin header de “Hola Carlos”
	- Sin footer/nav
	- Diseño mobile-first (como la referencia)
-->

<div class="min-h-screen bg-background">
	<!-- Top bar -->
	<div class="mx-auto w-full max-w-screen-md px-4 pt-6 sm:px-6 lg:px-8">
		<div class="relative flex items-center justify-between">
			<h1 class="text-2xl font-semibold tracking-tight sm:text-2xl">Dashboard Admin</h1>

			<Button
				variant="ghost"
				size="icon"
				class="absolute right-0 top-1/2 -translate-y-1/2 rounded-full"
				aria-label="Notificaciones"
			>
				<Bell class="h-8 w-8" />
			</Button>
		</div>
	</div>

	<!-- Content -->
	<main class="mx-auto w-full max-w-screen-md px-4 pb-24 pt-6 sm:px-6 lg:px-8">
		<!-- Title -->
		<section class="pt-2">
			<h2 class="text-[28px] font-semibold tracking-tight sm:text-[32px]">Resumen del Semestre</h2>
			<p class="mt-1 text-sm text-muted-foreground">
				<span class="text-foreground/90">{semester.label}</span>
				<span class="mx-2">•</span>
				{semester.updatedAt}
			</p>
			{#if error}
				<p class="mt-2 text-sm font-semibold text-red-600">{error}</p>
			{/if}
		</section>

		<!-- Stats -->
		<section class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {#each stats as s (s.label)}
            <Card class={`rounded-2xl border ${s.style.cardClass}`}>
                <CardContent class="p-5">
						<div class="flex items-start justify-between">
							<div class={`flex h-12 w-12 items-center justify-center rounded-2xl ${s.style.iconWrapClass}`}>
								<s.icon class={`h-6 w-6 ${s.style.iconClass}`} />
							</div>
								<Badge class={`mt-3 rounded-full px-3 py-1 text-sm font-semibold ${s.style.badgeClass}`}>
									{s.label}
								</Badge>
						</div>

						<div class="mt-5">
							<div class={`text-[44px] font-extrabold leading-none ${s.style.valueClass}`}>{s.value}</div>
						</div>
					</CardContent>
				</Card>
			{/each}
		</section>

		<!-- Pending requests -->
		<section class="mt-7">
			<div class="flex items-center justify-between">
				<h2 class="text-[22px] font-extrabold tracking-tight text-slate-900">Solicitudes Pendientes</h2>
				<button
					type="button"
					class="text-[14px] font-semibold text-blue-600 hover:text-blue-700"
					on:click={openAll}
				>
					Ver todas
				</button>
			</div>

			<div class="mt-4 space-y-4">
				{#if loading}
					<div class="text-sm text-muted-foreground">Cargando solicitudes...</div>
				{:else if !requests.length}
					<div class="text-sm text-muted-foreground">Sin solicitudes pendientes.</div>
				{/if}
				{#each requests as r (r.id)}
					<Card class="rounded-3xl border bg-card text-card-foreground shadow-sm">
						<CardContent class="p-5">
							<div class="flex items-start justify-between gap-3">
								<div class="flex items-center gap-3">
									<div class="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-[13px] font-bold text-slate-700">
										{r.initials}
									</div>
									<div>
										<div class="text-[16px] font-extrabold text-slate-900">{r.name}</div>
										<div class="text-[13px] font-semibold text-slate-600">{r.career}</div>
									</div>
								</div>

								<div class="flex items-center gap-2">
									{#if r.priority === 'BAJA'}
										<Badge class="rounded-xl bg-orange-50 text-orange-700 hover:bg-orange-50">URGENTE</Badge>
									{:else if r.ago}
										<span class="text-[12px] font-semibold text-slate-500">{r.ago}</span>
									{/if}
								</div>
							</div>

							<div class="mt-4 text-[15px] font-semibold text-slate-800">{r.title}</div>
							<div class="mt-2 flex items-center gap-2">
								<Badge
									class={`rounded-full ${
										r.requestType === 'cancellation'
											? 'bg-orange-50 text-orange-700 hover:bg-orange-50'
											: 'bg-blue-50 text-blue-700 hover:bg-blue-50'
									}`}
								>
									{r.requestTypeLabel}
								</Badge>
							</div>
							{#if r.requestReason}
								<div class="mt-2 text-xs text-slate-600">Motivo: {r.requestReason}</div>
							{/if}

							<div class="mt-4 flex items-center gap-3">
								<Button
									class="h-11 flex-1 rounded-2xl bg-blue-600 text-white hover:bg-blue-700"
									onclick={() => approve(r.id)}
									disabled={requestsLoading}
								>
									✓&nbsp;Aprobar
								</Button>

								<Button
									variant="outline"
									class="h-11 flex-1 rounded-2xl border-red-200 text-red-700 hover:bg-red-50"
									onclick={() => deny(r.id)}
									disabled={requestsLoading}
								>
									✕&nbsp;Denegar
								</Button>

								<Button
									variant="secondary"
									size="icon"
									class="h-11 w-11 rounded-2xl"
									onclick={() => view(r.id)}
								>
									<Eye class="h-5 w-5" />
								</Button>
							</div>
						</CardContent>
					</Card>
				{/each}
			</div>
		</section>

		<!-- Participation -->
		<!-- <section class="mt-8">
			<h2 class="text-[22px] font-extrabold tracking-tight text-slate-900">Participación por Carrera</h2>

			<Card class="mt-4 rounded-3xl border-0 bg-white shadow-sm">
				<CardContent class="p-5">
					<div class="space-y-5">
						{#each participation as p (p.label)}
							<div>
								<div class="flex items-center justify-between">
									<div class="text-[14px] font-bold text-slate-900">{p.label}</div>
									<div class="text-[13px] font-semibold text-slate-600">{p.value}%</div>
								</div>
								<div class="mt-2 h-3 w-full rounded-full bg-slate-100">
									<div
										class="h-3 rounded-full bg-blue-500"
										style="width: {p.value}%"
									/>
								</div>
							</div>
						{/each}
					</div>
				</CardContent>
			</Card>
		</section> -->

		<!-- Upcoming events -->
		<section class="mt-8">
			<h2 class="text-[22px] font-extrabold tracking-tight text-slate-900">Próximos Eventos</h2>

			<div class="mt-4 space-y-4">
				{#if loading}
					<div class="text-sm text-muted-foreground">Cargando eventos...</div>
				{:else if !upcomingEvents.length}
					<div class="text-sm text-muted-foreground">No hay eventos para mostrar.</div>
				{/if}
				{#each upcomingEvents as e (e.id)}
					<Card class="rounded-3xl border bg-card text-card-foreground shadow-sm">
						<CardContent class="p-5">
							<div class="flex items-center gap-4">
								<div class="flex h-14 w-14 flex-col items-center justify-center rounded-2xl bg-slate-50">
									<div class="text-[12px] font-extrabold text-slate-500">{e.dateMonth}</div>
									<div class="text-[18px] font-extrabold text-slate-900">{e.dateDay}</div>
								</div>

								<div class="min-w-0 flex-1">
									<div class="truncate text-[16px] font-extrabold text-slate-900">{e.title}</div>
									<div class="mt-1 flex items-center gap-2 text-[13px] font-semibold text-slate-600">
										<span class="inline-flex items-center gap-2">
											<span class="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-slate-50">
												<CalendarDays class="h-4 w-4" />
											</span>
											{e.time}
										</span>
									</div>
									<div class="mt-2">
										<Badge class="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
											{e.availabilityLabel}
										</Badge>
									</div>
								</div>

								<div class="text-right">
									<div class="text-[14px] font-extrabold text-blue-600">{e.metaRightTop}</div>
									<div class="text-[12px] font-semibold text-slate-500">{e.metaRightBottom}</div>
								</div>
							</div>
						</CardContent>
					</Card>
				{/each}
			</div>
		</section>
	</main>

	<!-- Floating action (Crear evento) -->
	<!--<button
		type="button"
		class="fixed bottom-6 right-6 inline-flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg active:scale-[0.98]"
		on:click={() => console.log('fab: crear evento')}
		aria-label="Acción rápida"
	>
		<CalendarPlus2 class="h-6 w-6" />
	</button>-->
</div>
    
