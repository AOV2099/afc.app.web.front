const FALLBACK_API_BASE_URL = 'http://132.248.44.4:3004';

function normalizeBaseUrl(value) {
	return String(value || '').trim().replace(/\/$/, '');
}

export const API_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL) || FALLBACK_API_BASE_URL;
