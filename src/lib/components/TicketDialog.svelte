<script>
	import { toPng } from 'html-to-image';
	import { toast } from 'svelte-sonner';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button';
	import { publicEventsApi } from '$lib/services/api';
	import { createTicketQrDataUrl } from '$lib/services/qrCodeService';
	import { formatEventSchedule } from '$lib/utils/eventCards.js';
	import { Download } from 'lucide-svelte';

	export let open = false;
	export let eventId = null;
	export let fallbackTitle = 'Evento';

	let loading = false;
	let error = '';
	let ticket = null;
	let loadedFor = null;
	let captureContainer;

	$: if (open && eventId && loadedFor !== eventId) loadTicket(eventId);
	$: if (!open) loadedFor = null;

	async function loadTicket(id) {
		loadedFor = id;
		loading = true;
		error = '';
		ticket = null;
		try {
			const res = await publicEventsApi.getEventTicket(id);
			const code = res?.ticket?.ticket_code || '';
			// En eventos de varias sesiones el ticket indica la siguiente sesión pendiente.
			const next = res?.attendance?.next_session;
			ticket = {
				title: res?.event?.title || fallbackTitle,
				date: next
					? formatEventSchedule(next.starts_at, next.ends_at)
					: formatEventSchedule(res?.event?.starts_at, res?.event?.ends_at),
				code,
				qrDataUrl: code ? await createTicketQrDataUrl(code) : null,
				pendingApproval: Boolean(res?.pending_approval)
			};
		} catch (err) {
			error = err?.message || 'No se pudo consultar el ticket.';
		} finally {
			loading = false;
		}
	}

	async function downloadTicket() {
		if (!captureContainer || !ticket) return;
		try {
			const dataUrl = await toPng(captureContainer, { cacheBust: true, pixelRatio: 2, backgroundColor: '#ffffff' });
			const slug =
				String(ticket.title || 'evento')
					.toLowerCase()
					.replace(/[^a-z0-9]+/gi, '-')
					.replace(/(^-|-$)/g, '') || 'evento';
			const link = document.createElement('a');
			link.download = `ticket-${slug}.png`;
			link.href = dataUrl;
			link.click();
		} catch {
			toast.error('No se pudo descargar la imagen del ticket.');
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[90dvh] w-[min(94vw,440px)] overflow-y-auto rounded-3xl p-0" data-testid="ticket-dialog">
		<div class="px-6 pt-6 text-center">
			<Dialog.Title class="text-2xl font-semibold">Ticket de asistencia</Dialog.Title>
		</div>

		<div bind:this={captureContainer} class="bg-white px-6 py-5">
			{#if loading}
				<div class="mx-auto flex h-56 w-56 items-center justify-center rounded-2xl bg-blue-50 text-sm text-muted-foreground">
					Cargando ticket...
				</div>
			{:else if error}
				<div class="mx-auto flex h-56 w-56 items-center justify-center rounded-2xl bg-red-50 px-4 text-center text-sm text-red-700">
					{error}
				</div>
			{:else if ticket}
				<div class="mx-auto flex h-56 w-56 items-center justify-center rounded-2xl bg-blue-50">
					{#if ticket.qrDataUrl}
						<img src={ticket.qrDataUrl} alt={`QR ticket ${ticket.code}`} class="h-48 w-48 rounded-md object-contain" />
					{:else}
						<div class="px-4 text-center text-sm text-muted-foreground">
							{ticket.pendingApproval ? 'Tu solicitud está pendiente de aprobación.' : 'Sin código QR disponible.'}
						</div>
					{/if}
				</div>
				<div class="mt-5 text-center">
					<h4 class="text-lg font-semibold">{ticket.title}</h4>
					<p class="mt-1 text-sm text-muted-foreground">{ticket.date}</p>
				</div>
				{#if ticket.qrDataUrl}
					<p class="mt-4 text-center text-sm text-muted-foreground">
						Presenta este QR al staff del evento para registrar tu asistencia.
					</p>
				{/if}
			{/if}
		</div>

		<div class="grid grid-cols-2 gap-3 px-6 pb-6">
			<Button variant="secondary" class="w-full rounded-xl" onclick={() => (open = false)}>Cerrar</Button>
			<Button class="w-full rounded-xl bg-blue-600 text-white hover:bg-blue-700" onclick={downloadTicket} disabled={!ticket?.qrDataUrl}>
				<Download class="mr-2 h-4 w-4" />
				Descargar
			</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
