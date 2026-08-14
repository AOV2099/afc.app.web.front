import { redirect } from '@sveltejs/kit';

import { getAuthenticatedUser, getRoleHomePath } from '$lib/server/auth';

export async function load({ fetch, request, setHeaders }) {
	setHeaders({
		'cache-control': 'no-store, max-age=0',
		'content-security-policy': "frame-ancestors 'none'",
		'x-frame-options': 'DENY',
		'referrer-policy': 'no-referrer'
	});

	const user = await getAuthenticatedUser({ fetch, request });

	if (user) {
		throw redirect(303, getRoleHomePath(user.role));
	}

	return {};
}
