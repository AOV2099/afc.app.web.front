<!-- src/routes/+layout.svelte -->
<script>
  import AdminAppShell from "./AdminAppShell.svelte";

  export let data;
</script>

<AdminAppShell user={data.user}>
<slot />
</AdminAppShell>
