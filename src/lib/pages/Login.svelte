<script>
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	import { Card, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { authApi, clearClientRole, getHomePathByRole } from '$lib/services/api';
	import { APP_VERSION } from '$lib/config/app.js';
	import { GOOGLE_AUTH_MODE, GOOGLE_AUTH_URL, GOOGLE_CLIENT_ID } from '$lib/services/config';
	import { loadGoogleIdentityServices, requestGoogleAuthorizationCode } from '$lib/services/googleAuth';
	import { setCurrentUser } from '../../routes/store';

	import { GraduationCap, Mail, Lock, Eye, EyeOff, ArrowRight, LoaderCircle } from 'lucide-svelte';

	const LOGIN_TABS = [
		{ id: 'community', label: 'Comunidad Aragón' },
		{ id: 'external', label: 'Externos' }
	];
	const PANEL_IN = { y: 10, duration: 220, easing: cubicOut };
	const LOGIN_TAB_STORAGE_KEY = 'afc.login.tab';

	let activeTab = 'community';

	function selectTab(tabId) {
		activeTab = tabId;
		error = '';
		try {
			localStorage.setItem(LOGIN_TAB_STORAGE_KEY, tabId);
		} catch {
			// Sin almacenamiento disponible solo se pierde la preferencia.
		}
	}

	function handleTabKeydown(event) {
		if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
		event.preventDefault();
		const nextTab = activeTab === 'community' ? 'external' : 'community';
		selectTab(nextTab);
		document.getElementById(`login-tab-${nextTab}`)?.focus();
	}

	let email = '';
	let password = '';
	let showPassword = false;

	let loading = false;
	let googleLoading = false;
	let googleInitializing = GOOGLE_AUTH_MODE === 'direct' && Boolean(GOOGLE_CLIENT_ID);
	let error = '';

	onMount(() => {
		const oauthError = new URL(window.location.href).searchParams.get('oauth_error');
		try {
			if (!oauthError && localStorage.getItem(LOGIN_TAB_STORAGE_KEY) === 'external') activeTab = 'external';
		} catch {
			// Sin almacenamiento disponible se queda la pestaña por defecto.
		}
		const oauthMessages = {
			access_denied: 'Cancelaste el inicio de sesión con Google.',
			invalid_state: 'El intento de acceso expiró o ya fue utilizado. Intenta nuevamente.',
			invalid_callback: 'Google devolvió una respuesta incompleta.',
			redirect_uri_mismatch: 'La URL de retorno no coincide con Google Cloud.',
			user_disabled: 'El usuario se encuentra deshabilitado. Consulta a un administrador.',
			domain_forbidden: 'Debes utilizar una cuenta del dominio institucional autorizado.',
			account_conflict: 'El correo ya está vinculado con otra cuenta de acceso.',
			not_provisioned: 'Tu cuenta aún no ha sido dada de alta. Contacta a un administrador.',
			not_authorized: 'Tu cuenta no está autorizada para ingresar. Contacta a un administrador.',
			session_error: 'No se pudo crear la sesión. Intenta nuevamente.',
			google_error: 'Google no pudo completar la autenticación.'
		};

		if (oauthError) {
			error = oauthMessages[oauthError] || 'No se pudo completar el inicio de sesión con Google.';
			const cleanUrl = new URL(window.location.href);
			cleanUrl.searchParams.delete('oauth_error');
			window.history.replaceState({}, document.title, cleanUrl.pathname + cleanUrl.search);
		}

		if (GOOGLE_AUTH_MODE === 'gateway') return;
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
		if (loading || googleLoading) return;

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
			if (GOOGLE_AUTH_MODE === 'gateway') {
				window.location.assign(GOOGLE_AUTH_URL);
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

		<div
			role="tablist"
			aria-label="Tipo de acceso"
			tabindex="-1"
			class="mx-auto mt-5 flex w-fit rounded-full bg-slate-100 p-1 text-sm"
			onkeydown={handleTabKeydown}
		>
			{#each LOGIN_TABS as tab (tab.id)}
				<button
					type="button"
					role="tab"
					id={`login-tab-${tab.id}`}
					aria-selected={activeTab === tab.id}
					aria-controls={`login-panel-${tab.id}`}
					tabindex={activeTab === tab.id ? 0 : -1}
					class={`rounded-full px-4 py-1.5 font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${
						activeTab === tab.id
							? 'bg-white text-slate-900 shadow-sm'
							: 'text-slate-500 hover:text-slate-700'
					}`}
					onclick={() => selectTab(tab.id)}
				>
					{tab.label}
				</button>
			{/each}
		</div>

		{#if activeTab === 'community'}
		<div
			id="login-panel-community"
			role="tabpanel"
			aria-labelledby="login-tab-community"
			class="mt-6 space-y-4"
			in:fly={PANEL_IN}
		>
			{#if error}
				<div
					id="login-error"
					role="alert"
					class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
				>
					{error}
				</div>
			{/if}

			<!-- Google Identity Services: OAuth 2.0 Authorization Code con popup -->
			<button
				type="button"
				aria-label="Ingresar con Google"
				aria-busy={googleLoading || googleInitializing}
				aria-describedby={error ? 'login-error' : undefined}
				disabled={loading || googleLoading || googleInitializing}
				class="group block w-full rounded-3xl bg-gradient-to-br from-blue-500/40 via-sky-300/30 to-amber-300/50 p-px text-left shadow-lg shadow-blue-100 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-200/70 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 active:translate-y-0 disabled:cursor-wait disabled:opacity-80 disabled:hover:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
				onclick={handleGoogleLogin}
			>
				<span class="relative flex min-h-[15rem] flex-col items-center justify-center gap-5 overflow-hidden rounded-[calc(1.5rem-1px)] bg-white px-6 py-8">
					<span aria-hidden="true" class="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-blue-100/60 blur-2xl transition-transform duration-500 group-hover:scale-125"></span>
					<span aria-hidden="true" class="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-amber-100/70 blur-2xl transition-transform duration-500 group-hover:scale-125"></span>

					<span class="relative grid h-20 w-20 place-items-center rounded-full bg-white shadow-md ring-1 ring-slate-100 transition-transform duration-200 group-hover:scale-110">
						{#if googleLoading || googleInitializing}
							<LoaderCircle class="h-9 w-9 animate-spin text-blue-600" />
						{:else}
							<img
								alt=""
								class="h-10 w-10"
								src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
							/>
						{/if}
					</span>

					<span class="relative flex items-center gap-2 text-xl font-semibold text-slate-900">
						{#if googleLoading || googleInitializing}
							{googleInitializing ? 'Preparando Google...' : 'Conectando con Google...'}
						{:else}
							Ingresar con Google
							<ArrowRight class="h-5 w-5 text-slate-400 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-blue-600" />
						{/if}
					</span>

					<span class="relative text-center text-[15px] text-slate-500">Alumnos y personal de la F.E.S. Aragón.</span>
				</span>
			</button>
		</div>
		{:else}
		<div id="login-panel-external" role="tabpanel" aria-labelledby="login-tab-external" class="mt-6" in:fly={PANEL_IN}>
		<form class="space-y-6" onsubmit={handleLogin}>
			<p class="text-center text-base text-slate-500">
				Staff o personal externo a la facultad.
			</p>

			<div class="space-y-3">
				<Label for="login-email" class="text-xl font-semibold text-slate-900">
					Correo electrónico
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
						placeholder="correo@ejemplo.com"
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
				disabled={loading || googleLoading}
				class="h-16 w-full rounded-2xl bg-blue-600 text-xl font-semibold shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:opacity-60"
			>
				{#if loading}
					Iniciando...
				{:else}
					Iniciar Sesión
					<ArrowRight class="ml-3 h-6 w-6" />
				{/if}
			</Button>
		</form>
		</div>
		{/if}

		<p class="mt-8 text-center text-xs font-medium text-slate-400">Versión {APP_VERSION}</p>
	</div>
</div>
