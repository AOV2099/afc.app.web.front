<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { careersApi, meApi } from '$lib/services/api';
	import { setCurrentUser } from '../../routes/store';

	let loading = false;
	let saving = false;
	let loadError = '';
	let role = '';
	let email = '';
	let careers = [];

	let form = {
		firstName: '',
		lastName: '',
		studentId: '',
		career: ''
	};

	function normalizeRole(value) {
		return String(value || '').trim().toLowerCase();
	}

	$: isStudent = normalizeRole(role) === 'student';

	async function loadProfile() {
		loading = true;
		loadError = '';
		let userIsStudent = false;
		try {
			const res = await meApi.getProfile();
			const user = res?.user || {};
			const resolvedRole =
				user?.role ??
				user?.membershipRole ??
				user?.membership_role ??
				user?.membership?.role ??
				'';
			role = resolvedRole;
			userIsStudent = normalizeRole(resolvedRole) === 'student';
			email = user?.email || '';
			form = {
				firstName: user?.firstName || user?.first_name || '',
				lastName: user?.lastName || user?.last_name || '',
				studentId: user?.studentId || user?.student_id || '',
				career:
					(typeof user?.career === 'object' && user?.career
						? String(user?.career?.id || '')
						: String(user?.career || ''))
			};

			if (!userIsStudent) {
				form = {
					...form,
					studentId: '',
					career: ''
				};
			}
		} catch (e) {
			loadError = e?.message || 'No se pudo cargar tu perfil.';
		}
		finally {
			loading = false;
		}
		return userIsStudent;
	}

	async function loadCareers(shouldLoad = isStudent) {
		if (!shouldLoad) {
			careers = [];
			return;
		}

		try {
			const res = await careersApi.list();
			careers = Array.isArray(res?.careers) ? res.careers : [];
		} catch {
			careers = [];
		}
	}

	async function saveProfile() {
		if (saving) return;

		if (!String(form.firstName || '').trim()) {
			toast.error('El nombre es obligatorio.');
			return;
		}

		if (!String(form.lastName || '').trim()) {
			toast.error('Los apellidos son obligatorios.');
			return;
		}

		if (isStudent && !String(form.studentId || '').trim()) {
			toast.error('La matrícula es obligatoria.');
			return;
		}

		if (isStudent && !String(form.career || '').trim()) {
			toast.error('Debes seleccionar una carrera.');
			return;
		}

		const payload = {
			firstName: String(form.firstName || '').trim(),
			lastName: String(form.lastName || '').trim()
		};

		if (isStudent) {
			payload.studentId = String(form.studentId || '').trim();
			payload.career = String(form.career || '').trim();
		}

		saving = true;
		try {
			const res = await meApi.updateProfile(payload);
			if (res?.user) setCurrentUser(res.user);
			toast.success(res?.message || 'Perfil actualizado correctamente.');
			await goto('/app/account');
		} catch (e) {
			toast.error(e?.message || 'No se pudo actualizar el perfil.');
		} finally {
			saving = false;
		}
	}

	onMount(async () => {
		const userIsStudent = await loadProfile();
		await loadCareers(userIsStudent);
	});
</script>

<div class="mx-auto w-full max-w-screen-md px-4 pb-20 pt-6 sm:px-6 lg:px-8">
	<div class="mb-4 flex items-center justify-between">
		<h1 class="text-2xl font-semibold tracking-tight">Editar perfil</h1>
		<Button variant="secondary" class="rounded-xl" onclick={() => goto('/app/account')}>Volver</Button>
	</div>

	{#if loadError}
		<div class="mb-4 text-sm font-semibold text-red-600">{loadError}</div>
	{/if}

	<Card class="rounded-3xl border bg-card text-card-foreground">
		<CardContent class="space-y-4 p-5">
			{#if loading}
				<div class="text-sm text-muted-foreground">Cargando perfil...</div>
			{:else}
				<div class="space-y-2">
					<Label>Correo</Label>
					<Input value={email} disabled />
				</div>

				<div class="space-y-2">
					<Label>Nombre</Label>
					<Input bind:value={form.firstName} placeholder="Tu nombre" />
				</div>

				<div class="space-y-2">
					<Label>Apellidos</Label>
					<Input bind:value={form.lastName} placeholder="Tus apellidos" />
				</div>

				{#if isStudent}
					<div class="space-y-2">
						<Label>Matrícula</Label>
						<Input bind:value={form.studentId} placeholder="Tu matrícula" required />
					</div>

					<div class="space-y-2">
						<Label>Carrera</Label>
						<select class="h-10 w-full rounded-md border px-3" bind:value={form.career} required>
							<option value="">Selecciona una carrera</option>
							{#each careers as career (career.id)}
								<option value={career.id}>{career.name} — {career.faculty}</option>
							{/each}
						</select>
					</div>
				{/if}

				<Button class="h-11 w-full rounded-2xl bg-blue-600 text-white hover:bg-blue-700" onclick={saveProfile} disabled={saving}>
					{saving ? 'Guardando...' : 'Guardar cambios'}
				</Button>
			{/if}
		</CardContent>
	</Card>
</div>
