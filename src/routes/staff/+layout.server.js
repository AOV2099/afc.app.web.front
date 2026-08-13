import { redirect } from '@sveltejs/kit';
import { getAuthenticatedUser, getRoleHomePath } from '$lib/server/auth';

export async function load({ fetch, request }) {
	const user = await getAuthenticatedUser({ fetch, request });

	if (!user) {
		throw redirect(303, '/login');
	}

	if (user.role !== 'staff') {
		throw redirect(303, getRoleHomePath(user.role));
	}

	return { role: user.role, user };
}
