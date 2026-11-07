import { expect, request } from '@playwright/test';

// El back limita /api/login a 10 intentos por minuto: cada cuenta inicia sesión una sola vez por worker.
const sessions = new Map();

async function login(email, password) {
	for (let attempt = 0; attempt < 3; attempt += 1) {
		const ctx = await request.newContext({ baseURL: process.env.AFC_E2E_BASE_URL, ignoreHTTPSErrors: true });
		const res = await ctx.post('/api/login', { data: { email, password } });
		if (res.status() === 429) {
			await ctx.dispose();
			await new Promise((resolve) => setTimeout(resolve, (Number(res.headers()['retry-after']) || 20) * 1000));
			continue;
		}
		expect(res.ok(), `login ${email}`).toBeTruthy();
		const state = await ctx.storageState();
		await ctx.dispose();
		return state;
	}
	throw new Error(`login ${email}: límite de intentos`);
}

export async function sessionState(email, password) {
	if (!sessions.has(email)) {
		const pending = login(email, password);
		sessions.set(email, pending);
		pending.catch(() => sessions.delete(email));
	}
	return sessions.get(email);
}

/** Contexto de API ya autenticado (reutiliza la sesión de la cuenta). */
export async function apiLogin(email, password) {
	return request.newContext({
		baseURL: process.env.AFC_E2E_BASE_URL,
		ignoreHTTPSErrors: true,
		storageState: await sessionState(email, password)
	});
}
