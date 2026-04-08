import { json } from '@sveltejs/kit';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST({ request, cookies }) {
	let body;

	try {
		body = await request.json();
	} catch {
		return json({ ok: false, message: 'Payload inválido.' }, { status: 400 });
	}

	const firstName = body?.firstName?.trim?.() || '';
	const lastName = body?.lastName?.trim?.() || '';
	const email = body?.email?.trim?.().toLowerCase?.() || '';
	const password = body?.password?.trim?.() || '';

	if (!firstName || !lastName || !email || !password) {
		return json(
			{ ok: false, message: 'Nombre, apellido, correo y contraseña son obligatorios.' },
			{ status: 400 }
		);
	}

	if (!EMAIL_REGEX.test(email)) {
		return json({ ok: false, message: 'Correo inválido.' }, { status: 400 });
	}

	if (password.length < 6) {
		return json({ ok: false, message: 'La contraseña debe tener al menos 6 caracteres.' }, { status: 400 });
	}

	// Demo de mapeo con db.sql:
	// users.full_name = `${firstName} ${lastName}`
	// users.email = email (CITEXT UNIQUE)
	// users.password_hash = hash(password)
	const user = {
		full_name: `${firstName} ${lastName}`,
		email
	};

	cookies.set('session', 'dev-ok', {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: false,
		maxAge: 60 * 60 * 24 * 7
	});

	return json({ ok: true, user });
}
