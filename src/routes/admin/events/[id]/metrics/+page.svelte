<script>
	import { page } from '$app/stores';
	import AdminMetrics from '$lib/pages/AdminMetrics.svelte';
</script>

<AdminMetrics eventId={$page.params.id} />
