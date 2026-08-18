import { env } from '$env/dynamic/public';

const FALLBACK_API_BASE_URL = '';

function normalizeBaseUrl(value) {
	return String(value || '').trim().replace(/\/$/, '');
}

export const API_BASE_URL =
	normalizeBaseUrl(env.PUBLIC_API_BASE_URL) ||
	FALLBACK_API_BASE_URL;

export const GOOGLE_CLIENT_ID = String(env.PUBLIC_GOOGLE_CLIENT_ID || '').trim();
export const GOOGLE_AUTH_MODE =
	String(env.PUBLIC_GOOGLE_AUTH_MODE || 'direct').trim().toLowerCase() === 'gateway'
		? 'gateway'
		: 'direct';
