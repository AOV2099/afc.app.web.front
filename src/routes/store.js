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

export const USER_ROLE_CATALOG = {
	admin: { value: "admin", label: "Administrador" },
	staff: { value: "staff", label: "Staff" },
	student: { value: "student", label: "Estudiante" },
	auditor: { value: "auditor", label: "Auditor" },
	visitor: { value: "visitor", label: "Visitante" }
};

/** Etiqueta en español de un valor de catálogo; si no existe, se muestra el valor tal cual. */
export function catalogLabel(catalog, value, fallback = "Sin dato") {
	if (value === null || value === undefined || value === "") return fallback;
	const key = String(value).trim().toLowerCase();
	return catalog?.[key]?.label || String(value);
}

export const EVENT_REGISTRATION_MODE_CATALOG = {
	auto: {
		value: "auto",
		label: "Automático",
		description: "La inscripción se aprueba al instante y el alumno recibe su ticket."
	},
	manual_review: {
		value: "manual_review",
		label: "Revisión manual",
		description:
			"La inscripción queda pendiente hasta que el organizador la aprueba en Solicitudes; al aprobarla se emite el ticket."
	}
};

export const EVENT_REGISTRATION_MODE_HELP =
	"Define cómo se confirma la inscripción del alumno. Las solicitudes pendientes también ocupan lugar del cupo.";

// resubmission_policy: "allowed" permite volver a solicitar tras un rechazo; cualquier otro valor lo impide.
export const EVENT_REAPPLY_OPTIONS = [
	{
		value: "allowed",
		label: "Sí, puede volver a solicitar",
		description: "Si el organizador rechaza su solicitud, el alumno puede enviarla de nuevo y vuelve a quedar pendiente."
	},
	{
		value: "not_allowed",
		label: "No",
		description: "Si su solicitud es rechazada, ya no puede volver a inscribirse a este evento."
	}
];

export const EVENT_REAPPLY_HELP = "Solo aplica a eventos con registro por revisión manual.";

export function normalizeReapplyPolicy(value) {
	return value === "allowed" ? "allowed" : "not_allowed";
}

export const EVENT_CANCEL_POLICY_CATALOG = {
	free_until_deadline: {
		value: "free_until_deadline",
		label: "Libre hasta fecha y hora límite",
		backendValue: "free_cancel",
		requiresDeadline: true,
		description:
			"Puede darse de baja libremente hasta la fecha límite; después, su baja queda como solicitud que el organizador valida."
	},
	free_cancel: {
		value: "free_cancel",
		label: "Cancelación libre",
		description: "Puede darse de baja en cualquier momento antes del evento y su lugar se libera."
	},
	locked: {
		value: "locked",
		label: "Bloqueada",
		description: "Una vez aprobada su inscripción, la baja queda como solicitud que el organizador valida."
	},
	penalize_no_show: { value: "penalize_no_show", label: "Penalizar inasistencia" }
};

export const EVENT_CANCEL_POLICY_HELP =
	"Define si el alumno puede darse de baja por su cuenta. Después de registrar su asistencia ya no puede darse de baja.";

// "Penalizar inasistencia" queda oculta hasta definir cómo se aplicará la penalización.
export const EVENT_CANCEL_POLICY_OPTIONS = Object.values(EVENT_CANCEL_POLICY_CATALOG).filter(
	(option) => option.value !== "penalize_no_show"
);
