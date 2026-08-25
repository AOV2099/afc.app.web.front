<script>
  import AdminUsers from '$lib/pages/AdminUsers.svelte';

  export let data;
</script>

<AdminUsers currentUser={data.user} />

