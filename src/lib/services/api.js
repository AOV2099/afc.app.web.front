import { API_BASE_URL } from './config';

const ROLE_HOME_PATH = {
	admin: '/admin/home',
	staff: '/staff/scanner',
	student: '/app/home',
	visitor: '/app/home'
};

function normalizeRole(role) {
	return String(role || '').trim().toLowerCase();
}

export function getHomePathByRole(role) {
	return ROLE_HOME_PATH[normalizeRole(role)] || '/app/home';
}

export function persistClientRole(role) {
	const normalized = normalizeRole(role);
	if (typeof document === 'undefined' || !normalized) return;
	document.cookie = `afc_role=${encodeURIComponent(normalized)}; Path=/; SameSite=Lax`;
}

export function clearClientRole() {
	if (typeof document === 'undefined') return;
	document.cookie = 'afc_role=; Path=/; Max-Age=0; SameSite=Lax';
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
			clearClientRole();
			window.location.assign('/login');
		}
	}
}

async function apiFetch(path, options = {}) {
	const response = await fetch(`${API_BASE_URL}${path}`, {
		credentials: 'include',
		headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
		...options
	});

	const data = await response.json().catch(() => null);

	if (!response.ok) {
		const message = data?.message || `Request failed (${response.status})`;
		redirectToLoginIfUnauthorized(response.status, message);
		throw new Error(message);
	}

	return data;
}

function toQueryString(params = {}) {
	const search = new URLSearchParams();

	for (const [key, value] of Object.entries(params)) {
		if (value === undefined || value === null || value === '') continue;
		search.set(key, String(value));
	}

	const query = search.toString();
	return query ? `?${query}` : '';
}

export const authApi = {
	login(payload) {
		return apiFetch('/api/login', {
			method: 'POST',
			body: JSON.stringify(payload)
		});
	},
	me() {
		return apiFetch('/api/me', { method: 'GET' });
	},
	register(payload) {
		return apiFetch('/api/register', {
			method: 'POST',
			body: JSON.stringify(payload)
		});
	},
	logout() {
		return apiFetch('/api/logout', { method: 'POST' });
	}
};

export const systemApi = {
	health() {
		return apiFetch('/health', { method: 'GET' });
	}
};

export const adminUsersApi = {
	listUsers(params = {}) {
		return apiFetch(`/api/admin/users${toQueryString(params)}`, { method: 'GET' });
	},
	createUser(payload) {
		return apiFetch('/api/admin/users', {
			method: 'POST',
			body: JSON.stringify(payload)
		});
	},
	updateUser(userId, payload) {
		return apiFetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
			method: 'PUT',
			body: JSON.stringify(payload)
		});
	},
	updateUserPassword(userId, payload) {
		return apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/password`, {
			method: 'PATCH',
			body: JSON.stringify(payload)
		});
	}
};

export const adminEventsApi = {
	listEvents(params = {}) {
		return apiFetch(`/api/admin/events${toQueryString(params)}`, { method: 'GET' });
	},
	getEventById(eventId) {
		return apiFetch(`/api/admin/events/${encodeURIComponent(eventId)}`, { method: 'GET' });
	},
	createEvent(payload) {
		return apiFetch('/api/admin/events', {
			method: 'POST',
			body: JSON.stringify(payload)
		});
	},
	updateEvent(eventId, payload) {
		return apiFetch(`/api/admin/events/${encodeURIComponent(eventId)}`, {
			method: 'PUT',
			body: JSON.stringify(payload)
		});
	},
	deleteEvent(eventId) {
		return apiFetch(`/api/admin/events/${encodeURIComponent(eventId)}`, {
			method: 'DELETE'
		});
	}
};

export const adminStaffUsersApi = {
	list() {
		return apiFetch('/api/admin/staff-users', { method: 'GET' });
	}
};

export const adminRequestsApi = {
	listPending(params = {}) {
		return apiFetch(`/api/admin/requests/pending${toQueryString(params)}`, { method: 'GET' });
	},
	review(registrationId, payload = {}) {
		return apiFetch(`/api/admin/requests/${encodeURIComponent(registrationId)}/approve`, {
			method: 'POST',
			body: JSON.stringify(payload)
		});
	}
};

export const publicEventsApi = {
	listEvents(params = {}) {
		return apiFetch(`/api/events${toQueryString(params)}`, { method: 'GET' });
	},
	registerToEvent(eventId, payload = {}) {
		return apiFetch(`/api/events/${encodeURIComponent(eventId)}/register`, {
			method: 'POST',
			body: JSON.stringify({ payload })
		});
	},
	unregisterFromEvent(eventId, reason = null) {
		return apiFetch(`/api/events/${encodeURIComponent(eventId)}/unregister`, {
			method: 'POST',
			body: JSON.stringify({ reason })
		});
	},
	getEventTicket(eventId) {
		return apiFetch(`/api/events/${encodeURIComponent(eventId)}/ticket`, {
			method: 'GET'
		});
	},
	trackEventView(eventId) {
		return apiFetch(`/api/events/${encodeURIComponent(eventId)}/view`, {
			method: 'POST'
		});
	}
};

export const myRegistrationsApi = {
	list(params = {}) {
		return apiFetch(`/api/me/registrations${toQueryString(params)}`, {
			method: 'GET'
		});
	}
};

export const myHoursApi = {
	history(params = {}) {
		return apiFetch(`/api/me/hours/history${toQueryString(params)}`, {
			method: 'GET'
		});
	}
};

export const meApi = {
	getProfile() {
		return apiFetch('/api/me', { method: 'GET' });
	},
	updateProfile(payload) {
		return apiFetch('/api/me/profile', {
			method: 'PATCH',
			body: JSON.stringify(payload || {})
		});
	},
	updatePassword(payload) {
		return apiFetch('/api/me/password', {
			method: 'PATCH',
			body: JSON.stringify(payload || {})
		});
	}
};

export const careersApi = {
	list() {
		return apiFetch('/api/careers', { method: 'GET' });
	}
};

export const alertsApi = {
	list(params = {}) {
		return apiFetch(`/api/alerts${toQueryString(params)}`, { method: 'GET' });
	},
	getById(alertId) {
		return apiFetch(`/api/alerts/${encodeURIComponent(alertId)}`, { method: 'GET' });
	}
};

export const adminAlertsApi = {
	create(payload) {
		return apiFetch('/api/admin/alerts', {
			method: 'POST',
			body: JSON.stringify(payload || {})
		});
	},
	update(alertId, payload) {
		return apiFetch(`/api/admin/alerts/${encodeURIComponent(alertId)}`, {
			method: 'PUT',
			body: JSON.stringify(payload || {})
		});
	},
	remove(alertId) {
		return apiFetch(`/api/admin/alerts/${encodeURIComponent(alertId)}`, {
			method: 'DELETE'
		});
	}
};
