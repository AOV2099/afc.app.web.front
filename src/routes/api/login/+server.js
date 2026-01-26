import { json } from '@sveltejs/kit';

export async function POST({ request, cookies }) {
	// Lee JSON (si lo mandas)
	const { email, password } = await request.json();

	cookies.set('session', 'dev-ok', {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: false,
		maxAge: 60 * 60 * 24 * 7
	});

	return json({ ok: true });
}
