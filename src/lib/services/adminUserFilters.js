export const USER_FILTERS_STORAGE_KEY = 'afc.admin.users.filters';

export const DEFAULT_USER_FILTERS = Object.freeze({
	roleFilter: 'all',
	statusFilter: 'all',
	studySystemFilter: 'all',
	careerFilter: 'all',
	sortBy: '',
	sortDirection: 'asc'
});

const STUDY_SYSTEMS = new Set(['all', 'esc', 'sua']);

/** Valida lo guardado en el navegador; cualquier valor desconocido vuelve a su default. */
export function normalizeUserFilters(raw, { roleOptions = [], statusOptions = [], sortFields = [] } = {}) {
	const saved = raw && typeof raw === 'object' ? raw : {};
	const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
	const career = String(saved.careerFilter ?? 'all');
	return {
		roleFilter: pick(saved.roleFilter, ['all', ...roleOptions], 'all'),
		statusFilter: pick(saved.statusFilter, ['all', ...statusOptions], 'all'),
		studySystemFilter: STUDY_SYSTEMS.has(saved.studySystemFilter) ? saved.studySystemFilter : 'all',
		careerFilter: career === 'all' || career === 'none' || /^\d+$/u.test(career) ? career : 'all',
		sortBy: pick(saved.sortBy, ['', ...sortFields], ''),
		sortDirection: saved.sortDirection === 'desc' ? 'desc' : 'asc'
	};
}

/** Filtros distintos al default (la carrera fija de un admin de carrera no cuenta). */
export function countActiveUserFilters(filters, { careerLocked = false } = {}) {
	return ['roleFilter', 'statusFilter', 'studySystemFilter', 'careerFilter'].filter((key) => {
		if (key === 'careerFilter' && careerLocked) return false;
		return (filters?.[key] ?? 'all') !== 'all';
	}).length;
}

export function loadUserFilters(storage, options) {
	try {
		return normalizeUserFilters(JSON.parse(storage?.getItem(USER_FILTERS_STORAGE_KEY) || 'null'), options);
	} catch {
		return { ...DEFAULT_USER_FILTERS };
	}
}

export function saveUserFilters(storage, filters) {
	try {
		storage?.setItem(USER_FILTERS_STORAGE_KEY, JSON.stringify(filters));
	} catch {
		// Preferencia no crítica: el navegador puede bloquear el almacenamiento.
	}
}
