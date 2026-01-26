<script>
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { ScrollArea, Scrollbar } from '$lib/components/ui/scroll-area';
	import { Separator } from '$lib/components/ui/separator';
	import * as Dialog from '$lib/components/ui/dialog/index.js';

	import {
		Bell,
		CalendarDays,
		MapPin,
		Ticket,
		ChevronRight,
		AlertTriangle,
		Briefcase,
		Megaphone,
		Calendar
	} from 'lucide-svelte';

	const nextEvent = {
		category: 'Formación Integral',
		title: 'Taller de Liderazgo Efectivo',
		description: 'Desarrolla habilidades clave para tu futuro profesional.',
		date: 'Hoy, 14:00 hrs',
		location: 'Auditorio B, Edificio Central'
	};

	const recommended = [
		{
			id: 1,
			category: 'TECNOLOGÍA',
			categoryClass: 'bg-blue-600 text-white',
			title: 'Intro a Python',
			date: 'Jueves, 16:00 hrs',
			img: 'https://images.unsplash.com/photo-1515879218367-8466d910aaa4?q=80&w=1400&auto=format&fit=crop'
		},
		{
			id: 2,
			category: 'HUMANIDADES',
			categoryClass: 'bg-amber-500 text-white',
			title: 'Club de Debate',
			date: 'Viernes, 10:00 hrs',
			img: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?q=80&w=1400&auto=format&fit=crop'
		},
		{
			id: 3,
			category: 'INNOVACIÓN',
			categoryClass: 'bg-emerald-600 text-white',
			title: 'Diseño de Producto',
			date: 'Lunes, 12:00 hrs',
			img: 'https://images.unsplash.com/photo-1545239351-1141bd82e8a6?q=80&w=1400&auto=format&fit=crop'
		},
		{
			id: 4,
			category: 'SOCIAL',
			categoryClass: 'bg-purple-600 text-white',
			title: 'Voluntariado',
			date: 'Sábado, 09:00 hrs',
			img: 'https://images.unsplash.com/photo-1520975682015-9345c7f1bb2d?q=80&w=1400&auto=format&fit=crop'
		}
	];

	const news = [
		{
			id: 1,
			icon: 'alert',
			title: 'Cambio de fecha: Exámenes finales',
			time: 'Hace 2h',
			description:
				'La administración ha actualizado el calendario académico. Por favor revisa las nuevas fechas...',
			tone: 'danger'
		},
		{
			id: 2,
			icon: 'briefcase',
			title: 'Nueva oferta de prácticas',
			time: 'Ayer',
			description: 'Empresas líderes en tecnología buscan estudiantes de últimos semestres.',
			tone: 'info'
		},
		{
			id: 3,
			icon: 'megaphone',
			title: 'Convocatoria Semillero',
			time: '23 Oct',
			description: 'Únete al grupo de investigación de Robótica Aplicada. Inscripciones abiertas.',
			tone: 'success'
		}
	];

	function iconFor(item) {
		if (item.icon === 'alert') return AlertTriangle;
		if (item.icon === 'briefcase') return Briefcase;
		return Megaphone;
	}

	function toneClasses(tone) {
		if (tone === 'danger') return 'bg-red-50 text-red-600';
		if (tone === 'success') return 'bg-emerald-50 text-emerald-600';
		return 'bg-blue-50 text-blue-600';
	}

	function showTicket(event = 'Sin evento') {
		console.log(event);
	}
</script>

<div class="mx-auto w-full max-w-screen-xl px-4 pt-6 pb-24 sm:px-6 lg:px-8">
	<!-- Próximo evento -->
	<div class="flex items-center justify-between">
		<h2 class="text-xl font-semibold tracking-tight">Próximo Evento</h2>
		<Button variant="link" class="h-auto px-0 text-primary">
			Ver calendario
			<Calendar class="ml-1 h-4 w-4" />
		</Button>
	</div>

	<Card class="mt-4 overflow-hidden rounded-2xl border bg-blue-600 shadow-sm ">
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
				<Dialog.Root>
					<Dialog.Trigger class="w-full">
						<Button
							variant="secondary"
							class="w-full rounded-xl bg-white text-blue-700 hover:bg-white/90"
						>
							<Ticket class="mr-2 h-4 w-4" />
							Ver Ticket
						</Button>
					</Dialog.Trigger>
					<Dialog.Content class="mx-auto w-max rounded-3xl p-0">
						<div class="px-6 pt-6 text-center">
							<div class=" mb-4 h-1.5 w-12 rounded-full bg-muted" />
							<h3 class="text-2xl font-semibold">Ticket de Asistencia</h3>

							<div class="mt-4 flex justify-center">
								<Badge variant="secondary" class="rounded-full px-4 py-1 text-blue-600">
									Juan Pérez · 202300456
								</Badge>
							</div>
						</div>

						<div class="px-6 py-6">
							<div class="mx-auto flex h-56 w-56 items-center justify-center rounded-2xl bg-blue-50">
								<!-- QR placeholder -->
								<div class="h-40 w-40 bg-[repeating-linear-gradient(45deg,#1e293b_0_10px,transparent_10px_20px)] opacity-40 rounded-md" />
							</div>

							<div class="mt-6 text-center">
								<h4 class="text-lg font-semibold">Taller de Liderazgo Efectivo</h4>
								<p class="mt-1 text-sm text-muted-foreground">
									15 de Octubre, 2024 · 10:00 AM
								</p>
							</div>

							<p class="mt-6 text-center text-sm text-muted-foreground">
								Presenta este QR al staff del evento para registrar tu asistencia automáticamente.
							</p>
						</div>

						<div class="px-6 pb-6 flex align-center justify-center w-full">
							<Dialog.Close asChild class="w-full">
								<Button class="w-full rounded-md shadow-sm shadow-blue-200 bg-blue-600" >Aceptar</Button>
							</Dialog.Close>
						</div>
					</Dialog.Content>
				</Dialog.Root>
			</div>
		</div>
	</Card>

	<!-- Recomendados -->
	<div class="mt-8 flex items-center justify-between">
		<h2 class="text-xl font-semibold tracking-tight">Recomendados para ti</h2>
		<Button variant="ghost" size="icon" class="rounded-full" aria-label="Ver más">
			<ChevronRight class="h-5 w-5" />
		</Button>
	</div>

	<ScrollArea class="mt-4 w-full whitespace-nowrap">
		<div class="flex gap-4 pb-3">
			{#each recommended as r (r.id)}
				<Card class="w-[260px] overflow-hidden rounded-2xl border pt-0 sm:w-[290px]">
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

		<Scrollbar orientation="horizontal" />
	</ScrollArea>

	<!-- Noticias y avisos -->
	<div class="mt-8">
		<h2 class="text-xl font-semibold tracking-tight">Noticias y Avisos</h2>
	</div>

	<div class="mt-4 space-y-3">
		{#each news as n (n.id)}
			{@const Icon = iconFor(n)}
			<Card class="rounded-2xl border">
				<CardContent class="flex gap-4 p-4 sm:p-5">
					<div
						class={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${toneClasses(n.tone)}`}
					>
						<Icon class="h-5 w-5" />
					</div>

					<div class="min-w-0 flex-1">
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0">
								<div class="truncate text-sm font-semibold sm:text-base">{n.title}</div>
							</div>
							<div class="shrink-0 text-xs text-muted-foreground sm:text-sm">{n.time}</div>
						</div>

						<div class="mt-1 line-clamp-2 text-sm text-muted-foreground">
							{n.description}
						</div>
					</div>
				</CardContent>
			</Card>
		{/each}
	</div>
</div>
