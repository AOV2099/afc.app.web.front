<script>
	import { toast } from 'svelte-sonner';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button';
	import { publicEventsApi } from '$lib/services/api';

	export let open = false;
	/** @type {{ id: number|string, title?: string } | null} */
	export let event = null;
	/** Recibe la respuesta del back para actualizar la pantalla que abrió el diálogo. */
	export let onDone = null;

	let processing = false;

	async function confirmUnsubscribe() {
		if (!event?.id || processing) return;
		processing = true;
		try {
			const res = await publicEventsApi.unregisterFromEvent(event.id, null);
			toast.success(res?.message || 'Se solicitó la baja del evento.');
			open = false;
			await onDone?.(res, event);
		} catch (error) {
			toast.error(error?.message || 'No se pudo solicitar la baja del evento.');
		} finally {
			processing = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="mx-auto w-[min(92vw,460px)] rounded-2xl p-0" data-testid="unsubscribe-dialog">
		<div class="p-5">
			<Dialog.Title class="text-lg font-semibold">Confirmar baja del evento</Dialog.Title>
			<p class="mt-3 text-sm text-muted-foreground">
				¿Seguro que deseas darte de baja de <span class="font-medium text-foreground">{event?.title || 'este evento'}</span>?
			</p>
			<p class="mt-2 text-sm text-muted-foreground">
				Nota: algunas solicitudes de baja pueden quedar en revisión del organizador antes de aplicarse.
			</p>

			<div class="mt-5 grid grid-cols-2 gap-3">
				<Button variant="secondary" class="w-full rounded-xl" disabled={processing} onclick={() => (open = false)}>
					Cancelar
				</Button>
				<Button class="w-full rounded-xl bg-red-600 text-white hover:bg-red-700" disabled={processing} onclick={confirmUnsubscribe}>
					{processing ? 'Procesando...' : 'Confirmar baja'}
				</Button>
			</div>
		</div>
	</Dialog.Content>
</Dialog.Root>
