<!-- src/routes/+layout.svelte -->
<script>
  import "./layout.css";
	import { Toaster } from 'svelte-sonner';
</script>

<Toaster richColors position="top-right" />
<slot />
