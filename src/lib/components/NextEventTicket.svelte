<script>
	import { toPng } from 'html-to-image';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { createTicketQrDataUrl } from '$lib/services/qrCodeService';
	import { panelIn, staggerDelay } from '$lib/utils/motion.js';
	import { CalendarDays, Download, MapPin } from 'lucide-svelte';

	/** Datos de mapEventToCard con ticketCode y enrollmentLabel. */
	export let event;
	export let index = 0;
	export let onOpen = null;

	let qrDataUrl = null;
	let captureContainer;

	$: loadQr(event?.ticketCode);

	async function loadQr(code) {
		// Resolución alta para que el lector lo capture nítido en pantallas densas.
		qrDataUrl = code ? await createTicketQrDataUrl(code, { width: 560 }) : null;
	}

	async function downloadTicket() {
		if (!captureContainer || !qrDataUrl) return;
		try {
			const dataUrl = await toPng(captureContainer, { cacheBust: true, pixelRatio: 2, backgroundColor: '#ffffff' });
			const slug = String(event.title || 'evento').toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/(^-|-$)/g, '') || 'evento';
			const link = document.createElement('a');
			link.download = `ticket-${slug}.png`;
			link.href = dataUrl;
			link.click();
		} catch {
			toast.error('No se pudo descargar la imagen del ticket.');
		}
	}
</script>

<article
	class="min-w-0 overflow-hidden rounded-2xl border bg-white shadow-sm"
	data-testid="next-event-ticket"
	in:panelIn|global={{ delay: staggerDelay(index) }}
>
	<div class="relative h-20 w-full overflow-hidden bg-blue-600">
		<img src={event.img} alt="" class="h-full w-full object-cover opacity-80" loading="lazy" />
		<div class="absolute inset-0 bg-gradient-to-r from-blue-900/80 to-blue-600/30"></div>
		<span class={`absolute left-4 top-4 inline-flex max-w-[calc(100%-7rem)] items-center rounded-lg px-2 py-1 text-xs font-medium ${event.tagClass}`}>
			<svelte:component this={event.categoryIcon} class="mr-1 h-3.5 w-3.5 shrink-0" />
			<span class="truncate">{event.tag}</span>
		</span>
		{#if event.credits}
			<span class="absolute right-4 top-4 rounded-xl bg-white/90 px-2 py-0.5 text-xs font-semibold">{event.credits}</span>
		{/if}
	</div>

	<!-- Muesca de boleto entre la portada y el cuerpo. -->
	<div class="relative border-b border-dashed">
		<span class="absolute -left-3 -top-3 h-6 w-6 rounded-full border bg-background"></span>
		<span class="absolute -right-3 -top-3 h-6 w-6 rounded-full border bg-background"></span>
	</div>

	<div bind:this={captureContainer} class="flex flex-col items-center gap-4 bg-white p-5 sm:flex-row sm:items-center">
		<div class="grid h-60 w-60 shrink-0 place-items-center rounded-2xl bg-white ring-1 ring-blue-100">
			{#if qrDataUrl}
				<img src={qrDataUrl} alt={`QR del ticket de ${event.title}`} class="h-56 w-56 object-contain [image-rendering:pixelated]" />
			{:else}
				<div class="px-3 text-center text-xs text-muted-foreground">{event.enrollmentLabel || 'Sin código QR disponible.'}</div>
			{/if}
		</div>

		<div class="min-w-0 flex-1 space-y-2 text-center sm:text-left">
			<h3 class="line-clamp-2 text-lg font-semibold leading-tight [overflow-wrap:anywhere]">{event.title}</h3>
			<div class="space-y-1 text-sm text-muted-foreground">
				<div class="flex items-start justify-center gap-2 sm:justify-start">
					<CalendarDays class="mt-0.5 h-4 w-4 shrink-0" />
					<span class="min-w-0 [overflow-wrap:anywhere]">{event.date}</span>
				</div>
				<div class="flex items-start justify-center gap-2 sm:justify-start">
					<MapPin class="mt-0.5 h-4 w-4 shrink-0" />
					<span class="min-w-0 truncate">{event.place}</span>
				</div>
			</div>
			{#if qrDataUrl}
				<p class="text-xs text-muted-foreground">Presenta este QR al staff del evento para registrar tu asistencia.</p>
			{/if}
		</div>
	</div>

	<div class="grid grid-cols-2 gap-2 px-5 pb-5">
		<Button variant="secondary" class="w-full rounded-xl" onclick={() => onOpen?.()}>Ver evento</Button>
		<Button class="w-full rounded-xl bg-blue-600 text-white hover:bg-blue-700" onclick={downloadTicket} disabled={!qrDataUrl}>
			<Download class="mr-2 h-4 w-4" />
			Descargar
		</Button>
	</div>
</article>
