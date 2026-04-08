import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

function getSessionCookieCandidates() {
	return [
		env.SESSION_COOKIE_NAME,
		'afc_sid',
		'session',
		'sid',
		'connect.sid',
		'sessionId',
		'session_id'
	].filter(Boolean);
}

function getRoleHomePath(role) {
	if (role === 'admin') return '/admin/home';
	if (role === 'staff') return '/staff/scanner';
	return '/app/home';
}

export function load({ cookies }) {
	const hasSession = getSessionCookieCandidates().some((cookieName) => Boolean(cookies.get(cookieName)));
	if (!hasSession) {
		return {};
	}

	const role = String(cookies.get('afc_role') || '').trim().toLowerCase();
	throw redirect(303, getRoleHomePath(role));
}
