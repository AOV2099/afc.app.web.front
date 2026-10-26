<script>
	import { Button } from '$lib/components/ui/button';
	import { Ticket } from 'lucide-svelte';

	// Pie común de las tarjetas de eventos inscritos (Inicio, Explorar y Mi calendario).
	export let canViewTicket = false;
	export let onViewTicket = null;
</script>

{#if canViewTicket && typeof onViewTicket === 'function'}
	<Button class="w-full rounded-xl bg-blue-600 text-white hover:bg-blue-700" onclick={onViewTicket}>
		<Ticket class="mr-2 h-4 w-4" />
		Ver ticket
	</Button>
{/if}
