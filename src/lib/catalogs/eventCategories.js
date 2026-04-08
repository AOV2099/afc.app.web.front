import { getEventCategoryStyleClasses } from '$lib/stores/eventCategoryStyles';

export const EVENT_CATEGORY_CATALOG = {
	general: {
		value: 'general',
		label: 'General',
		aliases: ['general', 'otro', 'otros', 'varios', 'academico', 'academic', 'academics', 'acad'],
		iconKey: 'shapes',
		tagClass: 'bg-slate-600 text-white'
	},
	culturales: {
		value: 'culturales',
		label: 'Culturales',
		aliases: ['culturales', 'cultural', 'culture', 'cult'],
		iconKey: 'palette',
		tagClass: 'bg-fuchsia-600 text-white'
	},
	deportivas: {
		value: 'deportivas',
		label: 'Deportivas',
		aliases: ['deportivas', 'deportivo', 'deportiva', 'sports', 'sport', 'dep'],
		iconKey: 'dumbbell',
		tagClass: 'bg-emerald-600 text-white'
	},
	investigacion: {
		value: 'investigacion',
		label: 'Investigación',
		aliases: ['investigacion', 'investigación', 'research'],
		iconKey: 'search',
		tagClass: 'bg-indigo-600 text-white'
	},
	vinculacion: {
		value: 'vinculacion',
		label: 'Vinculación',
		aliases: ['vinculacion', 'vinculación', 'linkage'],
		iconKey: 'key_round',
		tagClass: 'bg-cyan-700 text-white'
	},
	emprendimiento: {
		value: 'emprendimiento',
		label: 'Emprendimiento',
		aliases: ['emprendimiento', 'innovacion', 'innovación', 'startup', 'startups'],
		iconKey: 'landmark',
		tagClass: 'bg-amber-600 text-white'
	},
	responsabilidad_social: {
		value: 'responsabilidad_social',
		label: 'Responsabilidad Social',
		aliases: ['responsabilidad_social', 'responsabilidad social', 'social'],
		iconKey: 'users',
		tagClass: 'bg-rose-600 text-white'
	},
	formacion_humana: {
		value: 'formacion_humana',
		label: 'Formación Humana',
		aliases: ['formacion_humana', 'formación_humana', 'formacion humana', 'formación humana'],
		iconKey: 'book_open',
		tagClass: 'bg-sky-700 text-white'
	}
};

Object.values(EVENT_CATEGORY_CATALOG).forEach((category) => {
	const style = getEventCategoryStyleClasses(category.value);
	category.tagClass = `${style.bgClass} ${style.colorClass}`;
});

export const EVENT_CATEGORY_OPTIONS = [
	EVENT_CATEGORY_CATALOG.general,
	EVENT_CATEGORY_CATALOG.culturales,
	EVENT_CATEGORY_CATALOG.deportivas,
	EVENT_CATEGORY_CATALOG.investigacion,
	EVENT_CATEGORY_CATALOG.vinculacion,
	EVENT_CATEGORY_CATALOG.emprendimiento,
	EVENT_CATEGORY_CATALOG.responsabilidad_social,
	EVENT_CATEGORY_CATALOG.formacion_humana
];

function normalizeText(value) {
	return String(value || '')
		.trim()
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '');
}

export function normalizeEventCategory(value, fallback = 'general') {
	const normalized = normalizeText(value);
	if (!normalized) return fallback;

	const match = EVENT_CATEGORY_OPTIONS.find((option) =>
		option.aliases.some((alias) => normalized === alias || normalized.startsWith(alias))
	);

	return match?.value || fallback;
}

export function getEventCategoryMeta(value, fallback = 'general') {
	const key = normalizeEventCategory(value, fallback);
	return EVENT_CATEGORY_CATALOG[key] || EVENT_CATEGORY_CATALOG[fallback] || EVENT_CATEGORY_CATALOG.general;
}
