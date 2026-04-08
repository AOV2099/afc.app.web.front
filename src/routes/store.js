import { writable } from "svelte/store";

export const selectedView = writable(null); 
// valores: "home" | "explore" | "history" | "account"

export const currentUser = writable(null);

export function setCurrentUser(user) {
	currentUser.set(user || null);
}

export function clearCurrentUser() {
	currentUser.set(null);
}

// Catálogo de estatus de usuario (valor backend -> etiqueta UI)
export const USER_STATUS_CATALOG = {
	active: {
		value: "active",
		label: "Activo"
	},
	inactive: {
		value: "inactive",
		label: "Inactivo"
	}
};

export const EVENT_STATUS_CATALOG = {
	draft: { value: "draft", label: "Borrador" },
	published: { value: "published", label: "Publicado" },
	cancelled: { value: "cancelled", label: "Cancelado" },
	ended: { value: "ended", label: "Finalizado" }
};

export const EVENT_REGISTRATION_MODE_CATALOG = {
	auto: { value: "auto", label: "Automático" },
	manual_review: { value: "manual_review", label: "Revisión manual" }
};

export const EVENT_RESUBMISSION_POLICY_CATALOG = {
	allowed: { value: "allowed", label: "Permitido" },
	only_changes_requested: {
		value: "only_changes_requested",
		label: "Solo si se solicitaron cambios"
	},
	not_allowed: { value: "not_allowed", label: "No permitido" }
};

export const EVENT_CANCEL_POLICY_CATALOG = {
	free_until_deadline: {
		value: "free_until_deadline",
		label: "Libre hasta fecha y hora límite",
		backendValue: "free_cancel",
		requiresDeadline: true
	},
	free_cancel: { value: "free_cancel", label: "Cancelación libre" },
	locked: { value: "locked", label: "Bloqueada" },
	penalize_no_show: { value: "penalize_no_show", label: "Penalizar inasistencia" }
};
