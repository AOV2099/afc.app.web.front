<script>
	import { Eye, Loader2, LogOut } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import { viewAsApi } from '$lib/services/api';

	export let user;

	let exiting = false;

	$: fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.email || 'Usuario';
	$: expiresAt = user?.view_as?.expires_at ? new Date(user.view_as.expires_at) : null;
	$: expiresLabel = expiresAt
		? expiresAt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
		: '';

	async function exitViewAs() {
		if (exiting) return;
		exiting = true;
		try {
			const res = await viewAsApi.exit();
			window.location.assign(res?.home_path || '/admin/users');
		} catch (e) {
			toast.error(e?.message || 'No se pudo salir de la vista.');
			exiting = false;
		}
	}
</script>

<div
	class="sticky top-0 z-[60] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-violet-700 px-4 py-2 text-sm text-white shadow"
	role="status"
>
	<Eye class="h-4 w-4 shrink-0" />
	<span>
		Estás viendo como <strong>{fullName}</strong>
		<span class="opacity-80">({user?.email})</span> · Solo lectura{expiresLabel ? ` · hasta las ${expiresLabel}` : ''}
	</span>
	<button
		type="button"
		class="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-60"
		onclick={exitViewAs}
		disabled={exiting}
	>
		{#if exiting}
			<Loader2 class="h-3.5 w-3.5 animate-spin" />
		{:else}
			<LogOut class="h-3.5 w-3.5" />
		{/if}
		Salir de la vista
	</button>
</div>
