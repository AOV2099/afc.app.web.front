const API_BASE_URL = 'http://localhost:3000';

function toQueryString(params = {}) {
	const search = new URLSearchParams();

	for (const [key, value] of Object.entries(params)) {
		if (value === undefined || value === null || value === '') continue;
		search.set(key, String(value));
	}

	const query = search.toString();
	return query ? `?${query}` : '';
}

function getHttpMessageByStatus(status, fallbackMessage) {
	if (status === 400) return fallbackMessage || 'Solicitud inválida.';
	if (status === 401) return 'Tu sesión expiró. Inicia sesión nuevamente.';
	if (status === 403) return 'No tienes permisos para consultar este recurso.';
	if (status === 404) return 'No se encontró el evento solicitado.';
	if (status === 409) return fallbackMessage || 'Este ticket ya fue utilizado para esta sesión.';
	if (status >= 500) return 'Error del servidor. Intenta de nuevo en unos minutos.';
	return fallbackMessage || `Request failed (${status})`;
}

function getCheckinReasonMessage(details = {}) {
	const code = String(details?.code || '').trim().toUpperCase();
	const result = String(details?.result || '').trim().toLowerCase();
	const reason = String(details?.reason || '').trim();

	if (reason) return reason;
	if (code === 'TICKET_ALREADY_SCANNED' || result === 'duplicate') {
		return 'Este ticket ya fue utilizado para esta sesión.';
	}
	if (result === 'invalid_ticket') return 'El ticket no es válido para este evento.';
	if (result === 'cancelled_ticket') return 'El ticket está cancelado o no está activo.';
	if (result === 'rejected') return 'Check-in rechazado por reglas del evento (geocerca/GPS).';

	return '';
}

function extractBackendMessage(data, status) {
	const fallback =
		String(data?.message || '').trim() ||
		getCheckinReasonMessage(data);

	return getHttpMessageByStatus(status, fallback || undefined);
}

function redirectToLoginIfUnauthorized(status, message = '') {
	const normalizedMessage = String(message || '').toLowerCase();
	const isUnauthorized = Number(status) === 401;
	const isSessionMessage =
		normalizedMessage.includes('sin sesión') ||
		normalizedMessage.includes('sin sesion') ||
		normalizedMessage.includes('sesión inválida') ||
		normalizedMessage.includes('sesion invalida') ||
		normalizedMessage.includes('session');

	if ((isUnauthorized || isSessionMessage) && typeof window !== 'undefined') {
		if (window.location.pathname !== '/login') {    
			window.location.assign('/login');
		}
	}
}

async function request(path, options = {}) {
	const response = await fetch(`${API_BASE_URL}${path}`, {
		credentials: 'include',
		headers: {
			'Content-Type': 'application/json',
			...(options.headers || {})
		},
		...options
	});

	const data = await response.json().catch(() => null);

	if (!response.ok) {
		const message = extractBackendMessage(data, response.status);
		redirectToLoginIfUnauthorized(response.status, data?.message || message);
		const error = new Error(message);
		error.status = response.status;
		error.details = data;
		throw error;
	}

	return data;
}

export function getEventDashboard(eventId, { sessionId, recentLimit } = {}) {
	const query = toQueryString({
		sessionId,
		recentLimit
	});

	return request(`/api/admin/events/${encodeURIComponent(eventId)}/dashboard${query}`, {
		method: 'GET'
	});
}

export function getEventTimeline(eventId, { type, from, to, limit } = {}) {
	const query = toQueryString({
		type,
		from,
		to,
		limit
	});

	return request(`/api/admin/events/${encodeURIComponent(eventId)}/timeline${query}`, {
		method: 'GET'
	});
}

export function scanEventCheckin(payload) {
	return request('/api/admin/events/checkins/scan', {
		method: 'POST',
		body: JSON.stringify(payload || {})
	});
}

const adminEventsApi = {
	getEventDashboard,
	getEventTimeline,
	scanEventCheckin
};

export default adminEventsApi;
