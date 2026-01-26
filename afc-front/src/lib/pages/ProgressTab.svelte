<script>
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';

	import { BookOpen, CalendarCheck, CheckCircle2, Dumbbell, Landmark, Plus } from 'lucide-svelte';

	const progress = {
		percent: 70,
		doneHours: 35,
		totalHours: 50,
		events: 15,
		message: '¡Vas muy bien! Solo te faltan 15 horas.'
	};

	const categories = [
		{
			id: 1,
			name: 'Académicos',
			value: 10,
			total: 20,
			color: 'bg-blue-600',
			iconBg: 'bg-blue-100',
			iconText: 'text-blue-700',
			icon: BookOpen
		},
		{
			id: 2,
			name: 'Culturales',
			value: 5,
			total: 10,
			color: 'bg-purple-600',
			iconBg: 'bg-purple-100',
			iconText: 'text-purple-700',
			icon: Landmark
		},
		{
			id: 3,
			name: 'Deportivos',
			value: 20,
			total: 20,
			color: 'bg-orange-500',
			iconBg: 'bg-orange-100',
			iconText: 'text-orange-700',
			icon: Dumbbell
		}
	];

	const timeline = [
		{
			id: 1,
			state: 'done',
			date: '12 Oct 2023',
			title: 'Taller de Liderazgo',
			badge: { text: 'Completado', cls: 'bg-emerald-100 text-emerald-700' }
		},
		{
			id: 2,
			state: 'active',
			date: 'En curso',
			title: 'Semana de la Ingeniería',
			badge: { text: 'Activo', cls: 'bg-blue-100 text-blue-700' }
		},
		{ id: 3, state: 'pending', date: 'Pendiente', title: 'Requisito de Idiomas', badge: null }
	];

	const donutStyle = `background: conic-gradient(#0b6ef3 ${progress.percent}%, #e5e7eb 0);`;
</script>

<div class="space-y-8">
	<!-- Estado General -->
	<div>
		<div class="text-2xl font-semibold tracking-tight">Estado General</div>

		<Card class="mt-4 rounded-2xl border">
			<CardContent class="p-5 sm:p-6">
				<div class="flex items-start justify-between gap-4">
					<div>
						<div class="text-xs font-semibold tracking-widest text-muted-foreground">
							AVANCE TOTAL
						</div>
						<div class="mt-2 text-4xl font-semibold">{progress.percent}%</div>
					</div>

					<span
						class="inline-flex items-center rounded-full bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700"
					>
						{progress.doneHours}/{progress.totalHours} Horas
					</span>
				</div>

				<div class="mt-4 h-3 w-full rounded-full bg-muted">
					<div class="h-3 rounded-full bg-blue-600" style={`width:${progress.percent}%`} />
				</div>

				<div class="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
					<CheckCircle2 class="h-4 w-4 text-emerald-600" />
					<span>{progress.message}</span>
				</div>
			</CardContent>
		</Card>
	</div>

	<!-- Distribución por categoría -->
	<div>
		<div class="text-2xl font-semibold tracking-tight">Distribución por Categoría</div>

		<Card class="mt-4 rounded-2xl border">
			<CardContent class="p-6">
				<div class="mx-auto grid h-56 w-56 place-items-center rounded-full" style={donutStyle}>
					<div
						class="grid h-[82%] w-[82%] place-items-center rounded-full bg-background text-center"
					>
						<div class="text-4xl font-semibold">{progress.events}</div>
						<div class="text-xs font-semibold tracking-widest text-muted-foreground">EVENTOS</div>
					</div>
				</div>
			</CardContent>
		</Card>

		<div class="mt-5 space-y-4">
			{#each categories as c (c.id)}
				<Card class="rounded-2xl border">
					<CardContent class="p-4">
						<div class="flex items-center justify-between gap-3">
							<div class="flex items-center gap-3">
								<div
									class={`grid h-11 w-11 place-items-center rounded-2xl ${c.iconBg} ${c.iconText}`}
								>
									<svelte:component this={c.icon} class={`h-5 w-5 ${c.iconText}`} />
								</div>
								<div class="text-base font-semibold">{c.name}</div>
							</div>
							<div class="text-sm text-muted-foreground">{c.value}/{c.total} hrs</div>
						</div>

						<div class="mt-3 h-2 w-full rounded-full bg-muted">
							<div
								class={`h-2 rounded-full ${c.color}`}
								style={`width:${Math.min(100, (c.value / c.total) * 100)}%`}
							/>
						</div>
					</CardContent>
				</Card>
			{/each}
		</div>
	</div>

	<!-- Trayectoria -->
	<div>
		<div class="text-2xl font-semibold tracking-tight">Trayectoria</div>

		<Card class="mt-4 rounded-2xl border">
			<CardContent class="p-5">
				<div class="relative space-y-6">
					{#each timeline as t, i (t.id)}
						<div class="relative flex gap-4">
							{#if i < timeline.length - 1}
								<div class="absolute top-7 left-[13px] h-[calc(100%+16px)] w-[2px] bg-muted" />
							{/if}

							<div class="mt-1">
								{#if t.state === 'done'}
									<div class="grid h-7 w-7 place-items-center rounded-full bg-blue-600 text-white">
										<CheckCircle2 class="h-4 w-4" />
									</div>
								{:else if t.state === 'active'}
									<div
										class="grid h-7 w-7 place-items-center rounded-full border-2 border-blue-600 bg-background"
									>
										<div class="h-2.5 w-2.5 rounded-full bg-blue-600" />
									</div>
								{:else}
									<div
										class="grid h-7 w-7 place-items-center rounded-full border-2 border-muted bg-background"
									/>
								{/if}
							</div>

							<div class="min-w-0">
								<div class="text-sm text-muted-foreground">{t.date}</div>
								<div
									class={`mt-1 text-lg font-semibold ${t.state === 'pending' ? 'text-muted-foreground' : ''}`}
								>
									{t.title}
								</div>

								{#if t.badge}
									<span
										class={`mt-2 inline-flex items-center rounded-lg px-3 py-1 text-xs font-semibold ${t.badge.cls}`}
									>
										{t.badge.text}
									</span>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</CardContent>
		</Card>
	</div>
</div>
