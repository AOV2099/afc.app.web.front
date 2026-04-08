<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	import { Card, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { authApi, careersApi } from '$lib/services/api';

	import { GraduationCap, UserRound, Mail, Lock, Eye, EyeOff, ArrowRight, ArrowLeft } from 'lucide-svelte';
  import { toast } from 'svelte-sonner';

	let firstName = '';
	let lastName = '';
	let email = '';
	let password = '';
	let showPassword = false;
	let isStudent = false;
	let studentId = '';
	let careerId = '';
	let careers = [];

	let loading = false;
	let error = '';

	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

	function normalizeStudentId(value) {
		return String(value || '').slice(0, 10);
	}

	async function loadCareers() {
		try {
			const res = await careersApi.list();
			careers = Array.isArray(res?.careers) ? res.careers : [];
		} catch {
			careers = [];
		}
	}

	async function handleRegister() {
		error = '';

		const cleanFirstName = firstName.trim();
		const cleanLastName = lastName.trim();
		const cleanEmail = email.trim().toLowerCase();
		const cleanPassword = password.trim();
		const cleanStudentId = normalizeStudentId(studentId).trim();

		if (!cleanFirstName || !cleanLastName || !cleanEmail || !cleanPassword) {
			error = 'Completa nombre, apellido, correo y contraseña.';
			return;
		}

		if (!emailRegex.test(cleanEmail)) {
			error = 'Ingresa un correo válido.';
			return;
		}

		if (cleanPassword.length < 8) {
			error = 'La contraseña debe tener al menos 8 caracteres.';
			return;
		}

		if (isStudent && (!careerId || !cleanStudentId)) {
			error = 'Si eres estudiante, selecciona carrera y matrícula.';
			return;
		}

		loading = true;

		try {
			const payload = {
				firstName: cleanFirstName,
				lastName: cleanLastName,
				email: cleanEmail,
				password: cleanPassword,
				isStudent
			};

			if (isStudent) {
				payload.studentId = cleanStudentId;
				payload.career_id = Number(careerId);
			}

			const res = await authApi.register(payload);

            //revisar si estatus es 200 o 201, si no, mostrar error
            if (!res.ok) {
                throw new Error(res.message || res.error || 'Error desconocido al crear la cuenta.');
            }

            toast.success('Cuenta creada exitosamente.', {
                duration: 4000
            });

			await goto('/login');
		} catch (e) {
			error = e?.message || 'No se pudo crear la cuenta.';
		} finally {
			loading = false;
		}
	}

	onMount(async () => {
		await loadCareers();
	});
</script>

<div class="min-h-dvh bg-background">
	<div class="relative h-56 w-full overflow-hidden">
		<img
			src="https://www.aragon.unam.mx/fes-aragon/public_html/img/comunicacion_social/identidad-institucional.jpg"
			alt="Campus"
			class="absolute inset-0 z-0 h-full w-full object-cover"
		/>
		<div class="absolute inset-0 z-10 bg-background/20 backdrop-blur-xs pointer-events-none"></div>
	</div>

	<div class="relative z-20 mx-auto -mt-16 w-full max-w-md p-6">
		<div class="flex w-full justify-center m-0">
			<Card class="h-24 w-24 rounded-[22px] bg-white shadow-lg my-0 py-0">
				<CardContent class="grid h-full place-items-center p-0 m-0">
					<div class="grid h-20 w-20 place-items-center rounded-2xl bg-blue-50">
						<GraduationCap class="h-12 w-12 text-blue-600" />
					</div>
				</CardContent>
			</Card>
		</div>

		<h1 class="text-center text-[42px] font-semibold tracking-tight text-slate-900 mt-4">
			Crear cuenta
		</h1>
		<p class="-mt-2 text-center text-lg text-slate-500">
			{isStudent ? 'Regístrate como estudiante para continuar' : 'Regístrate como visitante para continuar'}
		</p>

		<div class="mt-6 space-y-5">
			<div class="rounded-2xl border border-slate-200 bg-white p-4">
				<div class="flex items-center justify-between gap-4">
					<div>
						<div class="text-base font-semibold text-slate-900">Soy estudiante</div>
						<div class="text-xs text-slate-500">Actívalo para capturar carrera y matrícula</div>
					</div>
					<button
						type="button"
						role="switch"
						aria-checked={isStudent}
						aria-label="Soy estudiante"
						class={`relative h-7 w-12 rounded-full transition ${isStudent ? 'bg-blue-600' : 'bg-slate-300'}`}
						onclick={() => (isStudent = !isStudent)}
					>
						<span
							class={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${isStudent ? 'left-6' : 'left-1'}`}
						></span>
					</button>
				</div>

				{#if isStudent}
					<div class="mt-4 grid gap-3">
						<div class="space-y-2">
							<Label class="text-base font-semibold text-slate-900">Carrera</Label>
							<select class="h-14 w-full rounded-2xl border border-slate-200 px-3 text-base" bind:value={careerId}>
								<option value="">Selecciona una carrera</option>
								{#each careers as career (career.id)}
									<option value={career.id}>{career.name} — {career.faculty}</option>
								{/each}
							</select>
						</div>

						<div class="space-y-2">
							<Label class="text-base font-semibold text-slate-900">Matrícula</Label>
							<Input
								bind:value={studentId}
								maxlength="10"
								type="text"
								placeholder="Máximo 10 caracteres"
								class="h-14 rounded-2xl border-slate-200 bg-white text-base text-slate-700 shadow-sm placeholder:text-slate-400"
								on:input={(event) => (studentId = normalizeStudentId(event.currentTarget.value))}
							/>
						</div>
					</div>
				{/if}
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div class="space-y-2">
					<Label class="text-base font-semibold text-slate-900">Nombre</Label>
					<div class="relative">
						<div
							class="absolute top-1/2 left-3 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg bg-slate-100 text-slate-500"
						>
							<UserRound class="h-4 w-4" />
						</div>
						<Input
							bind:value={firstName}
							type="text"
							placeholder="Nombre"
							class="h-14 rounded-2xl border-slate-200 bg-white pl-12 text-base text-slate-700 shadow-sm placeholder:text-slate-400"
						/>
					</div>
				</div>

				<div class="space-y-2">
					<Label class="text-base font-semibold text-slate-900">Apellido</Label>
					<div class="relative">
						<div
							class="absolute top-1/2 left-3 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg bg-slate-100 text-slate-500"
						>
							<UserRound class="h-4 w-4" />
						</div>
						<Input
							bind:value={lastName}
							type="text"
							placeholder="Apellido"
							class="h-14 rounded-2xl border-slate-200 bg-white pl-12 text-base text-slate-700 shadow-sm placeholder:text-slate-400"
						/>
					</div>
				</div>
			</div>

			<div class="space-y-2">
				<Label class="text-base font-semibold text-slate-900">Correo institucional</Label>
				<div class="relative">
					<div
						class="absolute top-1/2 left-3 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg bg-slate-100 text-slate-500"
					>
						<Mail class="h-4 w-4" />
					</div>
					<Input
						bind:value={email}
						type="email"
						placeholder="visitante@unam.aragon.com.mx"
						class="h-14 rounded-2xl border-slate-200 bg-white pl-12 text-base text-slate-700 shadow-sm placeholder:text-slate-400"
					/>
				</div>
			</div>

			<div class="space-y-2">
				<Label class="text-base font-semibold text-slate-900">Contraseña</Label>
				<div class="relative">
					<div
						class="absolute top-1/2 left-3 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg bg-slate-100 text-slate-500"
					>
						<Lock class="h-4 w-4" />
					</div>
					<Input
						bind:value={password}
						type={showPassword ? 'text' : 'password'}
						placeholder="Mínimo 8 caracteres"
						class="h-14 rounded-2xl border-slate-200 bg-white pr-12 pl-12 text-base text-slate-700 shadow-sm placeholder:text-slate-400"
					/>
					<button
						type="button"
						class="absolute top-1/2 right-3 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600"
						onclick={() => (showPassword = !showPassword)}
						aria-label="Mostrar/ocultar contraseña"
					>
						{#if showPassword}
							<EyeOff class="h-5 w-5" />
						{:else}
							<Eye class="h-5 w-5" />
						{/if}
					</button>
				</div>
			</div>

			{#if error}
				<div class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
					{error}
				</div>
			{/if}

			<Button
				onclick={() => handleRegister()}
				disabled={loading}
				class="h-14 w-full rounded-2xl bg-blue-600 text-lg font-semibold shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:opacity-60"
			>
				{#if loading}
					Creando cuenta...
				{:else}
					Crear cuenta
					<ArrowRight class="ml-2 h-5 w-5" />
				{/if}
			</Button>

			<Button
				type="button"
				variant="outline"
				class="h-14 w-full rounded-2xl border-slate-200 bg-white text-base font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
				onclick={() => goto('/login')}
			>
				<ArrowLeft class="mr-2 h-5 w-5" />
				Ya tengo cuenta
			</Button>
		</div>
	</div>
</div>
