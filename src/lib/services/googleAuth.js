const GOOGLE_IDENTITY_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const GOOGLE_OAUTH_SCOPE = 'openid email profile';

let googleIdentityPromise;

function googleAuthError(message, code) {
	const error = new Error(message);
	error.code = code;
	return error;
}

function getGoogleIdentityApi() {
	return globalThis.google?.accounts?.oauth2 ?? null;
}

export function loadGoogleIdentityServices() {
	if (typeof document === 'undefined') {
		return Promise.reject(
			googleAuthError('El inicio con Google solo está disponible en el navegador.', 'browser_required')
		);
	}

	const loadedApi = getGoogleIdentityApi();
	if (loadedApi) return Promise.resolve(loadedApi);
	if (googleIdentityPromise) return googleIdentityPromise;

	googleIdentityPromise = new Promise((resolve, reject) => {
		let script = document.querySelector(`script[src="${GOOGLE_IDENTITY_SCRIPT_URL}"]`);

		const handleLoad = () => {
			const api = getGoogleIdentityApi();
			if (api) {
				resolve(api);
				return;
			}
			googleIdentityPromise = undefined;
			script?.remove();
			reject(
				googleAuthError('Google no pudo inicializarse. Intenta nuevamente.', 'google_unavailable')
			);
		};

		const handleError = () => {
			googleIdentityPromise = undefined;
			script?.remove();
			reject(
				googleAuthError(
					'No se pudo cargar Google. Revisa tu conexión o el bloqueo de ventanas emergentes.',
					'script_load_failed'
				)
			);
		};

		if (!script) {
			script = document.createElement('script');
			script.src = GOOGLE_IDENTITY_SCRIPT_URL;
			script.async = true;
			script.defer = true;
			script.referrerPolicy = 'strict-origin-when-cross-origin';
		}

		script.addEventListener('load', handleLoad, { once: true });
		script.addEventListener('error', handleError, { once: true });
		if (!script.isConnected) document.head.appendChild(script);
	});

	return googleIdentityPromise;
}

function getPopupErrorMessage(type) {
	if (type === 'popup_closed') return 'Se cerró la ventana de Google antes de completar el acceso.';
	if (type === 'popup_failed_to_open') {
		return 'El navegador bloqueó la ventana de Google. Habilita las ventanas emergentes e intenta nuevamente.';
	}
	return 'No se pudo completar el acceso con Google.';
}

export async function requestGoogleAuthorizationCode(clientId) {
	const normalizedClientId = String(clientId || '').trim();
	if (!normalizedClientId) {
		throw googleAuthError(
			'El inicio con Google aún no está configurado. Agrega PUBLIC_GOOGLE_CLIENT_ID.',
			'missing_client_id'
		);
	}

	const googleOauth = await loadGoogleIdentityServices();

	return new Promise((resolve, reject) => {
		const codeClient = googleOauth.initCodeClient({
			client_id: normalizedClientId,
			scope: GOOGLE_OAUTH_SCOPE,
			ux_mode: 'popup',
			include_granted_scopes: true,
			callback(response) {
				if (response?.error) {
					reject(
						googleAuthError(
							response.error_description || 'Google rechazó la solicitud de acceso.',
							response.error
						)
					);
					return;
				}

				if (!response?.code) {
					reject(googleAuthError('Google no devolvió un código de acceso válido.', 'missing_code'));
					return;
				}

				resolve(response.code);
			},
			error_callback(details) {
				reject(googleAuthError(getPopupErrorMessage(details?.type), details?.type || 'popup_error'));
			}
		});

		try {
			codeClient.requestCode();
		} catch {
			reject(googleAuthError('No se pudo abrir el acceso con Google.', 'request_failed'));
		}
	});
}
