import { get, writable } from 'svelte/store';

import { afcCatalogApi } from '$lib/services/api';

export const afcCatalog = writable({ status: 'idle', types: [], error: '' });

let pending = null;

/** Carga el catálogo AFC activo una sola vez por sesión de página; force=true lo recarga. */
export function ensureAfcCatalog({ force = false } = {}) {
	const current = get(afcCatalog);
	if (!force && current.status === 'ready') return Promise.resolve(current.types);
	if (!force && pending) return pending;

	afcCatalog.set({ ...current, status: 'loading', error: '' });
	pending = afcCatalogApi
		.list()
		.then((response) => {
			const types = Array.isArray(response?.types) ? response.types : [];
			afcCatalog.set({ status: 'ready', types, error: '' });
			return types;
		})
		.catch((error) => {
			afcCatalog.set({ status: 'error', types: [], error: error?.message || 'No se pudo cargar el catálogo AFC.' });
			return [];
		})
		.finally(() => {
			pending = null;
		});
	return pending;
}
