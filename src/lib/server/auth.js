import { env } from '$env/dynamic/private';

const DEFAULT_BACKEND_URL = 'http://localhost:3000';

function normalizeBaseUrl(value) {
	return String(value || '').trim().replace(/\/$/, '');
}

export function getRoleHomePath(role) {
	const normalizedRole = String(role || '').trim().toLowerCase();
	if (normalizedRole === 'admin') return '/admin/home';
	if (normalizedRole === 'staff') return '/staff/scanner';
	return '/app/home';
}

export async function getAuthenticatedUser({ fetch, request }) {
	const cookieHeader = request.headers.get('cookie');
	if (!cookieHeader) return null;

	const backendUrl = normalizeBaseUrl(
		env.AFC_BACKEND_URL || env.API_INTERNAL_BASE_URL || DEFAULT_BACKEND_URL
	);

	try {
		const response = await fetch(`${backendUrl}/api/me`, {
			headers: {
				accept: 'application/json',
				cookie: cookieHeader
			}
		});

		if (!response.ok) return null;

		const data = await response.json();
		const user = data?.user;
		const role = String(user?.role || '').trim().toLowerCase();

		if (!data?.ok || !user || !role) return null;

		return { ...user, role };
	} catch {
		return null;
	}
}
