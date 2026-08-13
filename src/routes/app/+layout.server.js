import { redirect } from '@sveltejs/kit';
import { getAuthenticatedUser, getRoleHomePath } from '$lib/server/auth';

const APP_ALLOWED_ROLES = new Set(['student', 'visitor', 'auditor']);

export async function load({ fetch, request }) {
	const user = await getAuthenticatedUser({ fetch, request });

	if (!user) {
		throw redirect(303, '/login');
	}

	if (!APP_ALLOWED_ROLES.has(user.role)) {
		throw redirect(303, getRoleHomePath(user.role));
	}

	return { role: user.role, user };
}
