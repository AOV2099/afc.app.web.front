<!-- src/routes/+layout.svelte -->
<script>
  import "./layout.css";
	import { Toaster } from 'svelte-sonner';
	import { page } from '$app/stores';
	import ViewAsBanner from '$lib/components/ViewAsBanner.svelte';
</script>

<Toaster richColors position="top-right" />
{#if $page.data?.user?.view_as}
	<ViewAsBanner user={$page.data.user} />
{/if}
<slot />
