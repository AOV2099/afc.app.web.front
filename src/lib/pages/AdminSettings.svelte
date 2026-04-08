<script>
	import { goto } from '$app/navigation';
	import { authApi, clearClientRole } from '$lib/services/api';

	import { Card, CardContent } from '$lib/components/ui/card';
	import { Separator } from '$lib/components/ui/separator';
	import { Button } from '$lib/components/ui/button';
	import { Settings, LogOut } from 'lucide-svelte';

	let loggingOut = false;
	let error = '';

	async function onLogout() {
		if (loggingOut) return;
		loggingOut = true;
		error = '';

		try {
			await authApi.logout();
			clearClientRole();
			await goto('/login');
		} catch (e) {
			error = e?.message || 'No se pudo cerrar sesión.';
		} finally {
			loggingOut = false;
		}
	}
</script>

<section class="mx-auto w-full max-w-4xl p-4 sm:p-6">
	<div class="mb-6 flex items-center gap-3">
		<div class="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50">
			<Settings class="h-5 w-5 text-blue-700" />
		</div>
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Configuración</h1>
			<p class="text-sm text-muted-foreground">Opciones de administración de cuenta</p>
		</div>
	</div>

	<Card class="overflow-hidden rounded-2xl border bg-background">
		<CardContent class="p-0">
			<div class="px-5 py-4">
				<div class="text-base font-medium">Sesión</div>
				<div class="mt-1 text-sm text-muted-foreground">Cerrar tu sesión actual del panel admin.</div>
			</div>

			<Separator />

			<div class="p-4">
				<Button
					type="button"
					variant="outline"
					class="h-12 w-full justify-start rounded-xl border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
					onclick={onLogout}
					disabled={loggingOut}
				>
					<LogOut class="mr-2 h-4 w-4" />
					{loggingOut ? 'Cerrando sesión...' : 'Cerrar sesión'}
				</Button>
			</div>
		</CardContent>
	</Card>

	{#if error}
		<div class="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
			{error}
		</div>
	{/if}
</section>
