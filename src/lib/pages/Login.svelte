<script>
	import { goto } from '$app/navigation';

	import { Card, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Separator } from '$lib/components/ui/separator';

	import { GraduationCap, Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-svelte';

	let email = 'ejemplo@unam.aragon.com.mx';
	let password = 'admin';
	let showPassword = false;

	let loading = false;
	let error = '';

	async function handleLogin() {
		console.log('inciando...');

		loading = true;
		error = '';

		try {
			const res = await fetch('/api/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password })
			});

			if (!res.ok) throw new Error('Login failed');

			await goto('/app/home');
		} catch (e) {
			error = 'No se pudo iniciar sesión (demo).';
		} finally {
			loading = false;
		}
	}
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

	<div class="relative z-20 mx-auto -mt-16  w-full max-w-md p-6">
		<div class=" flex w-full justify-center m-0">
			<Card class="h-24 w-24 rounded-[22px] bg-white shadow-lg my-0 py-0">
				<CardContent class="grid h-full place-items-center p-0 m-0">
					<div class="grid h-20 w-20 place-items-center rounded-2xl bg-blue-50">
						<GraduationCap class="h-12 w-12 text-blue-600" />
					</div>
				</CardContent>
			</Card>
		</div>

		<h1 class="text-center text-[42px] font-semibold tracking-tight text-slate-900 mt-4">
			Portal de Formación
		</h1>
		<p class="-mt-2 text-center text-lg text-slate-500">Ingresa tus credenciales para continuar</p>

		<div class="mt-6 space-y-6">
			<div class="space-y-3">
				<Label class="text-xl font-semibold text-slate-900">Correo Institucional</Label>

				<div class="relative">
					<div
						class="absolute top-1/2 left-4 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg bg-slate-100 text-slate-500"
					>
						<Mail class="h-5 w-5" />
					</div>

					<Input
						bind:value={email}
						type="email"
						placeholder="estudiante@unam.aragon.com.mx"
						class="h-16 rounded-2xl border-slate-200 bg-white pl-14 text-lg text-slate-700 shadow-sm placeholder:text-slate-400"
					/>
				</div>
			</div>

			<div class="space-y-3">
				<Label class="text-xl font-semibold text-slate-900">Contraseña</Label>

				<div class="relative">
					<div
						class="absolute top-1/2 left-4 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg bg-slate-100 text-slate-500"
					>
						<Lock class="h-5 w-5" />
					</div>

					<Input
						bind:value={password}
						type={showPassword ? 'text' : 'password'}
						placeholder="••••••••"
						class="h-16 rounded-2xl border-slate-200 bg-white pr-14 pl-14 text-lg text-slate-700 shadow-sm placeholder:text-slate-400"
					/>

					<button
						type="button"
						class="absolute top-1/2 right-4 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600"
						on:click={() => (showPassword = !showPassword)}
						aria-label="Mostrar/ocultar contraseña"
					>
						{#if showPassword}
							<EyeOff class="h-6 w-6" />
						{:else}
							<Eye class="h-6 w-6" />
						{/if}
					</button>
				</div>

				<div class="flex justify-end">
					<a class="text-base font-semibold text-blue-600 hover:underline" href="/login">
						¿Olvidaste tu contraseña?
					</a>
				</div>
			</div>

			{#if error}
				<div class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
					{error}
				</div>
			{/if}

			<Button
				onclick={() => handleLogin()}
				disabled={loading}
				class="h-16 w-full rounded-2xl bg-blue-600 text-xl font-semibold shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:opacity-60"
			>
				{#if loading}
					Iniciando...
				{:else}
					Iniciar Sesión
					<ArrowRight class="ml-3 h-6 w-6" />
				{/if}
			</Button>

			<div class="flex items-center gap-4 pt-2">
				<Separator class="flex-1 bg-slate-200" />
				<div class="text-xs font-semibold tracking-[0.28em] text-slate-400">O CONTINÚA CON</div>
				<Separator class="flex-1 bg-slate-200" />
			</div>

			<Button
				type="button"
				variant="outline"
				class="h-16 w-full rounded-2xl border-slate-200 bg-white text-xl font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
			>
				<img
					alt="Google"
					class="mr-3 h-6 w-6"
					src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
				/>
				Ingresar con Google
			</Button>
		</div>
	</div>
</div>
