<script>
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { ArrowLeft, CircleCheck, LoaderCircle, TriangleAlert } from 'lucide-svelte';

	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { authApi, clearClientRole, getHomePathByRole } from '$lib/services/api';
	import { setCurrentUser } from '../../store';

	let status = 'loading';
	let message = 'Validando tu acceso seguro con Google...';

	const callbackErrors = {
		access_denied: 'Cancelaste el inicio de sesión con Google.',
		invalid_request: 'La solicitud de acceso no es válida.',
		invalid_state: 'El intento de acceso no es válido o expiró.',
		google_error: 'Google no pudo completar la autenticación.',
		bridge_error: 'El servicio de autenticación segura no pudo completar el acceso.'
	};

	function fail(text) {
		status = 'error';
		message = text;
	}

	onMount(() => {
		const params = new URLSearchParams(window.location.search);
		const code = String(params.get('code') || '').trim();
		const errorCode = String(params.get('error') || '').trim().toLowerCase();

		window.history.replaceState({}, document.title, '/auth/callback');

		if (errorCode) {
			fail(callbackErrors[errorCode] || 'No se pudo completar el inicio de sesión con Google.');
			return;
		}

		if (!code || code.length > 512) {
			fail('El código de acceso no es válido. Inicia sesión nuevamente.');
			return;
		}

		const controller = new AbortController();
		const timeout = window.setTimeout(() => controller.abort(), 15000);

		async function completeLogin() {
			try {
				const response = await authApi.completeGoogleBridge(code, { signal: controller.signal });
				if (!response?.ok) throw new Error(response?.message || 'No se pudo completar el acceso.');

				setCurrentUser(response?.user || null);
				clearClientRole();
				status = 'success';
				message = 'Acceso validado. Redirigiendo...';
				await goto(getHomePathByRole(response?.role || response?.user?.role), {
					replaceState: true
				});
			} catch (error) {
				if (error?.name === 'AbortError') {
					fail('La validación tardó demasiado. Inicia sesión nuevamente.');
				} else {
					fail(error?.message || 'No se pudo completar el inicio de sesión con Google.');
				}
			} finally {
				window.clearTimeout(timeout);
			}
		}

		void completeLogin();

		return () => {
			window.clearTimeout(timeout);
			controller.abort();
		};
	});
</script>

<svelte:head>
	<title>Validando acceso con Google</title>
	<meta name="robots" content="noindex,nofollow" />
</svelte:head>

<div class="grid min-h-dvh place-items-center bg-slate-50 px-6 py-12">
	<Card class="w-full max-w-md rounded-3xl border-slate-200 bg-white shadow-xl">
		<CardContent class="space-y-6 p-8 text-center">
			{#if status === 'loading'}
				<LoaderCircle class="mx-auto h-14 w-14 animate-spin text-blue-600" aria-hidden="true" />
			{:else if status === 'success'}
				<CircleCheck class="mx-auto h-14 w-14 text-emerald-600" aria-hidden="true" />
			{:else}
				<TriangleAlert class="mx-auto h-14 w-14 text-amber-600" aria-hidden="true" />
			{/if}

			<div class="space-y-2">
				<h1 class="text-2xl font-semibold text-slate-900">
					{status === 'error' ? 'No se pudo iniciar sesión' : 'Acceso con Google'}
				</h1>
				<p class="text-base text-slate-600" role={status === 'error' ? 'alert' : 'status'}>
					{message}
				</p>
			</div>

			{#if status === 'error'}
				<Button class="h-12 w-full rounded-xl" onclick={() => goto('/login', { replaceState: true })}>
					<ArrowLeft class="mr-2 h-5 w-5" />
					Volver al inicio de sesión
				</Button>
			{/if}
		</CardContent>
	</Card>
</div>
