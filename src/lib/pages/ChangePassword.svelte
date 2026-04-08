<script>
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { meApi } from '$lib/services/api';

	let saving = false;
	let form = {
		currentPassword: '',
		newPassword: '',
		confirmPassword: ''
	};

	async function savePassword() {
		if (saving) return;

		if (!form.currentPassword || !form.newPassword) {
			toast.error('Debes completar todos los campos.');
			return;
		}
		if (form.newPassword.length < 8) {
			toast.error('La nueva contraseña debe tener al menos 8 caracteres.');
			return;
		}
		if (form.newPassword !== form.confirmPassword) {
			toast.error('La confirmación no coincide con la nueva contraseña.');
			return;
		}
		if (form.currentPassword === form.newPassword) {
			toast.error('La nueva contraseña debe ser diferente a la actual.');
			return;
		}

		saving = true;
		try {
			const res = await meApi.updatePassword({
				currentPassword: form.currentPassword,
				newPassword: form.newPassword
			});
			toast.success(res?.message || 'Contraseña actualizada correctamente.');
			await goto('/app/account');
		} catch (e) {
			toast.error(e?.message || 'No se pudo actualizar la contraseña.');
		} finally {
			saving = false;
		}
	}
</script>

<div class="mx-auto w-full max-w-screen-md px-4 pb-20 pt-6 sm:px-6 lg:px-8">
	<div class="mb-4 flex items-center justify-between">
		<h1 class="text-2xl font-semibold tracking-tight">Cambiar contraseña</h1>
		<Button variant="secondary" class="rounded-xl" onclick={() => goto('/app/account')}>Volver</Button>
	</div>

	<Card class="rounded-3xl border bg-card text-card-foreground">
		<CardContent class="space-y-4 p-5">
			<div class="space-y-2">
				<Label>Contraseña actual</Label>
				<Input type="password" bind:value={form.currentPassword} />
			</div>

			<div class="space-y-2">
				<Label>Nueva contraseña</Label>
				<Input type="password" bind:value={form.newPassword} />
			</div>

			<div class="space-y-2">
				<Label>Confirmar nueva contraseña</Label>
				<Input type="password" bind:value={form.confirmPassword} />
			</div>

			<Button class="h-11 w-full rounded-2xl bg-blue-600 text-white hover:bg-blue-700" onclick={savePassword} disabled={saving}>
				{saving ? 'Guardando...' : 'Actualizar contraseña'}
			</Button>
		</CardContent>
	</Card>
</div>
