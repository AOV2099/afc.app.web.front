export const EVENT_CATEGORY_STYLE_CLASSES = {
	general: {
		colorClass: 'text-slate-700',
		bgClass: 'bg-slate-100',
		barClass: 'bg-slate-500'
	},
	culturales: {
		colorClass: 'text-fuchsia-700',
		bgClass: 'bg-fuchsia-100',
		barClass: 'bg-fuchsia-500'
	},
	deportivas: {
		colorClass: 'text-emerald-700',
		bgClass: 'bg-emerald-100',
		barClass: 'bg-emerald-500'
	},
	investigacion: {
		colorClass: 'text-indigo-700',
		bgClass: 'bg-indigo-100',
		barClass: 'bg-indigo-500'
	},
	vinculacion: {
		colorClass: 'text-cyan-700',
		bgClass: 'bg-cyan-100',
		barClass: 'bg-cyan-500'
	},
	emprendimiento: {
		colorClass: 'text-amber-700',
		bgClass: 'bg-amber-100',
		barClass: 'bg-amber-500'
	},
	responsabilidad_social: {
		colorClass: 'text-rose-700',
		bgClass: 'bg-rose-100',
		barClass: 'bg-rose-500'
	},
	formacion_humana: {
		colorClass: 'text-sky-700',
		bgClass: 'bg-sky-100',
		barClass: 'bg-sky-500'
	}
};

export function getEventCategoryStyleClasses(categoryKey = 'general') {
	return EVENT_CATEGORY_STYLE_CLASSES[categoryKey] || EVENT_CATEGORY_STYLE_CLASSES.general;
}
