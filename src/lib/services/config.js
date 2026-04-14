const FALLBACK_API_BASE_URL = '';
const FALLBACK_API_PORT = '3004';

function normalizeBaseUrl(value) {
	return String(value || '').trim().replace(/\/$/, '');
}

function buildRuntimeFallbackApiBaseUrl() {
	if (typeof window === 'undefined') return '';

	const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
	const hostname = window.location.hostname;
	const port = String(import.meta.env.VITE_API_PORT || FALLBACK_API_PORT).trim();

	if (!hostname || !port) return '';
	return `${protocol}//${hostname}:${port}`;
}

export const API_BASE_URL =
	normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL) ||
	normalizeBaseUrl(buildRuntimeFallbackApiBaseUrl()) ||
	FALLBACK_API_BASE_URL;
