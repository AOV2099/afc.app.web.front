<script>
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	import { Card, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Separator } from '$lib/components/ui/separator';
	import { authApi, clearClientRole, getHomePathByRole } from '$lib/services/api';
	import { GOOGLE_AUTH_MODE, GOOGLE_CLIENT_ID } from '$lib/services/config';
	import { loadGoogleIdentityServices, requestGoogleAuthorizationCode } from '$lib/services/googleAuth';
	import { setCurrentUser } from '../../routes/store';

	import { GraduationCap, Mail, Lock, Eye, EyeOff, ArrowRight, Plus, LoaderCircle } from 'lucide-svelte';

	let email = '';
	let password = '';
	let showPassword = false;

	let loading = false;
	let googleLoading = false;
	let googleInitializing = GOOGLE_AUTH_MODE === 'direct' && Boolean(GOOGLE_CLIENT_ID);
	let error = '';

	onMount(() => {
		if (GOOGLE_AUTH_MODE === 'bridge') return;
		if (!GOOGLE_CLIENT_ID) return;

		loadGoogleIdentityServices()
			.catch((e) => {
				error = e?.message || 'No se pudo preparar el acceso con Google.';
			})
			.finally(() => {
				googleInitializing = false;
			});
	});

	async function finishLogin(res) {
		if (!res?.ok) {
			throw new Error(res?.message || 'Error desconocido al iniciar sesión.');
		}

		setCurrentUser(res?.user || null);
		clearClientRole();
		await goto(getHomePathByRole(res?.role || res?.user?.role));
	}

	async function handleLogin(event) {
		event?.preventDefault();
		if (loading || googleLoading || googleInitializing) return;

		loading = true;
		error = '';

		try {
			const res = await authApi.login({ email, password });
			await finishLogin(res);
		} catch (e) {
			error = e?.message || 'No se pudo iniciar sesión.';
		} finally {
			loading = false;
		}
	}

	async function handleGoogleLogin() {
		if (loading || googleLoading || googleInitializing) return;

		googleLoading = true;
		error = '';

		try {
			if (GOOGLE_AUTH_MODE === 'bridge') {
				const response = await authApi.startGoogleBridge();
				const authorizationUrl = String(response?.authorization_url || '').trim();
				if (!authorizationUrl.startsWith('https://')) {
					throw new Error('El servicio de acceso seguro devolvió una URL inválida.');
				}
				window.location.assign(authorizationUrl);
				return;
			}

			const code = await requestGoogleAuthorizationCode(GOOGLE_CLIENT_ID);
			const res = await authApi.loginWithGoogle(code);
			await finishLogin(res);
		} catch (e) {
			error = e?.message || 'No se pudo iniciar sesión con Google.';
		} finally {
			googleLoading = false;
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

		<form class="mt-6 space-y-6" onsubmit={handleLogin}>
			<div class="space-y-3">
				<Label for="login-email" class="text-xl font-semibold text-slate-900">
					Correo Institucional
				</Label>

				<div class="relative">
					<div
						class="absolute top-1/2 left-4 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg bg-slate-100 text-slate-500"
					>
						<Mail class="h-5 w-5" />
					</div>

					<Input
						id="login-email"
						bind:value={email}
						type="email"
						name="email"
						autocomplete="username"
						required
						aria-invalid={error ? 'true' : undefined}
						aria-describedby={error ? 'login-error' : undefined}
						placeholder="estudiante@aragon.unam.mx"
						class="h-16 rounded-2xl border-slate-200 bg-white pl-14 text-lg text-slate-700 shadow-sm placeholder:text-slate-400"
					/>
				</div>
			</div>

			<div class="space-y-3">
				<Label for="login-password" class="text-xl font-semibold text-slate-900">
					Contraseña
				</Label>

				<div class="relative">
					<div
						class="absolute top-1/2 left-4 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg bg-slate-100 text-slate-500"
					>
						<Lock class="h-5 w-5" />
					</div>

					<Input
						id="login-password"
						bind:value={password}
						type={showPassword ? 'text' : 'password'}
						name="password"
						autocomplete="current-password"
						required
						aria-invalid={error ? 'true' : undefined}
						aria-describedby={error ? 'login-error' : undefined}
						placeholder="••••••••"
						class="h-16 rounded-2xl border-slate-200 bg-white pr-14 pl-14 text-lg text-slate-700 shadow-sm placeholder:text-slate-400"
					/>

					<button
						type="button"
						class="absolute top-1/2 right-4 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600"
						onclick={() => (showPassword = !showPassword)}
						aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
						aria-pressed={showPassword}
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
				<div
					id="login-error"
					role="alert"
					class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
				>
					{error}
				</div>
			{/if}

			<Button
				type="submit"
				disabled={loading || googleLoading || googleInitializing}
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
		</form>

		<div class="mt-6 space-y-6">
			<!-- crear una cuenta -->
			<Button
				type="button"
				variant="outline"
				class="h-16 w-full rounded-2xl border-slate-200 bg-white text-xl font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
				onclick={() => goto('/register')}
			>
				<Plus class="mr-2 h-5 w-5" />
				Crear una cuenta
			</Button>

			<!-- Google Identity Services: OAuth 2.0 Authorization Code con popup -->
			<Button
				type="button"
				variant="outline"
				aria-label="Ingresar con Google"
				aria-busy={googleLoading || googleInitializing}
				disabled={loading || googleLoading || googleInitializing}
				class="h-16 w-full rounded-2xl border-slate-200 bg-white text-xl font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
				onclick={handleGoogleLogin}
			>
				{#if googleLoading || googleInitializing}
					<LoaderCircle class="mr-3 h-6 w-6 animate-spin" />
					{googleInitializing ? 'Preparando Google...' : 'Conectando con Google...'}
				{:else}
					<img
						alt=""
						class="mr-3 h-6 w-6"
						src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
					/>
					Ingresar con Google
				{/if}
			</Button>
		</div>
	</div>
</div>
