<script>
	import AppShell from "./AppShell.svelte";
	export let data;
</script>

<AppShell user={data.user}>
  <slot />
</AppShell>
