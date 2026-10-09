import {
	AFC_METHOD,
	AFC_ORIGIN,
	AFC_SCENARIO_KIND,
	AFC_VALUATION_MODE,
	calculateAfcHours,
	formatAfcRangeLabel,
	isAfcManualMode
} from '../catalogs/afcHoursCalc.js';

export const AFC_FORMULA_HELP =
	'Horas = mínimo + (máximo − mínimo) × porcentaje del supuesto, redondeado hacia arriba en incrementos de media hora.';
export const AFC_EVIDENCE_ACCEPT = '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg';
export const AFC_EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;
export const AFC_EVIDENCE_PURPOSE = 'afc_hours_evidence';
export const AFC_HOURS_PENDING_MESSAGE =
	'Las horas AFC del evento aún no están completas; guárdalo como borrador hasta capturarlas.';

const emptyInputs = () => ({
	courseDayMode: 'single',
	courseDays: [{ date: '', effective_hours: '' }],
	manualHours: ''
});

export function createAfcState(overrides = {}) {
	return {
		origin: AFC_ORIGIN.FES_ARAGON,
		typeKey: '',
		scenarioKey: '',
		...emptyInputs(),
		evidence: null,
		...overrides
	};
}

export function getAfcTypesForOrigin(catalog, origin) {
	return (Array.isArray(catalog) ? catalog : []).filter((type) => type.origin === origin && type.is_active !== false);
}

// Cambiar el tipo limpia el supuesto, las entradas y el archivo.
export function changeAfcType(state, typeKey) {
	return { ...state, typeKey, scenarioKey: '', ...emptyInputs(), evidence: null };
}

export function changeAfcScenario(state, scenarioKey) {
	return { ...state, scenarioKey, ...emptyInputs() };
}

export function getAfcSelection(state, catalog) {
	const type =
		getAfcTypesForOrigin(catalog, state?.origin).find((item) => item.key === state?.typeKey) || null;
	const scenarios = (type?.scenarios || []).filter((item) => item.is_active !== false);
	const scenario = scenarios.find((item) => item.key === state?.scenarioKey) || null;
	const mode = type?.valuation_mode ?? null;
	return {
		type,
		scenarios,
		scenario,
		mode,
		isManual: isAfcManualMode(mode),
		isCommittee: mode === AFC_VALUATION_MODE.COMMITTEE,
		isCourseDuration: scenario?.kind === AFC_SCENARIO_KIND.COURSE_DURATION
	};
}

function courseDaysForPayload(state, defaultDate) {
	if (state.courseDayMode === 'multiple') {
		return state.courseDays.map((day) => ({
			date: String(day?.date || '').trim(),
			effective_hours: String(day?.effective_hours ?? '').trim()
		}));
	}
	return [
		{
			date: String(defaultDate || '').trim(),
			effective_hours: String(state.courseDays?.[0]?.effective_hours ?? '').trim()
		}
	];
}

/** Payload para el backend: solo selección y entradas; nunca resultados calculados en el cliente. */
export function buildAfcValuationPayload(state, { catalog = [], defaultDate = '' } = {}) {
	const selection = getAfcSelection(state, catalog);
	if (!selection.type) return null;
	const payload = { origin: state.origin, type_key: selection.type.key };
	if (selection.isManual) {
		payload.manual_hours = String(state.manualHours ?? '').trim();
		payload.evidence_file_id = state.evidence?.id ?? null;
		return payload;
	}
	if (!selection.scenario) return null;
	payload.scenario_key = selection.scenario.key;
	if (selection.isCourseDuration) payload.course_days = courseDaysForPayload(state, defaultDate);
	return payload;
}

/**
 * Vista previa de solo lectura. status: unselected | invalid | incomplete | calculated
 */
export function computeAfcPreview(state, { catalog = [], defaultDate = '' } = {}) {
	const selection = getAfcSelection(state, catalog);
	if (!selection.type || (!selection.isManual && !selection.scenario)) {
		return { status: 'unselected', ...selection };
	}
	const result = calculateAfcHours({
		type: selection.type,
		scenario: selection.isManual ? null : selection.scenario,
		inputs: {
			course_days: selection.isCourseDuration ? courseDaysForPayload(state, defaultDate) : null,
			manual_hours: selection.isManual ? state.manualHours : null
		}
	});
	if (!result.ok) return { status: 'invalid', message: result.message, ...selection };
	return {
		status: result.valuation.complete ? 'calculated' : 'incomplete',
		valuation: result.valuation,
		...selection
	};
}

export function formatAfcHours(value) {
	if (value === null || value === undefined || value === '') return '';
	const number = Number(value);
	return Number.isFinite(number) ? String(number) : String(value);
}

export function formatAfcRange(type) {
	if (!type) return '';
	return formatAfcRangeLabel(type.min_hours, type.max_hours);
}

/** Etiqueta del supuesto con las horas que produce dentro del rango de su actividad. */
export function formatAfcScenarioOption(type, scenario) {
	if (scenario.kind === AFC_SCENARIO_KIND.COURSE_DURATION) return scenario.label;
	const result = calculateAfcHours({ type, scenario });
	const hours = result.ok ? ` → ${formatAfcHours(result.valuation.final_hours)} h` : '';
	if (scenario.kind === AFC_SCENARIO_KIND.PERCENT) {
		return `${scenario.label} — ${formatAfcHours(scenario.percent)} %${hours}`;
	}
	return `${scenario.label}${hours}`;
}

/** Valida la sección AFC antes de guardar. */
export function validateAfcForSave(state, { catalog = [], status = 'draft', defaultDate = '', legacyHours = null } = {}) {
	if (!state?.typeKey) {
		if (legacyHours !== null && legacyHours !== undefined) return { ok: true, message: '' };
		return { ok: false, message: 'Selecciona el tipo de actividad.' };
	}
	const preview = computeAfcPreview(state, { catalog, defaultDate });
	if (!preview.type) return { ok: false, message: 'Selecciona un tipo de actividad válido.' };
	if (preview.status === 'unselected') return { ok: false, message: 'Selecciona el supuesto o actividad realizada.' };
	if (preview.status === 'invalid') return { ok: false, message: preview.message };

	if (preview.status === 'incomplete' && !['draft', 'cancelled'].includes(status)) {
		return { ok: false, message: AFC_HOURS_PENDING_MESSAGE };
	}
	if (preview.isCommittee && preview.status === 'calculated' && !state.evidence?.id) {
		return { ok: false, message: 'Adjunta el dictamen o evidencia del Comité de Carrera.' };
	}
	return { ok: true, message: '' };
}

export function afcStateFromEvent(event) {
	const valuation = event?.afc_valuation;
	if (!valuation || typeof valuation !== 'object' || !valuation.type_key) return createAfcState();

	const days =
		Array.isArray(valuation.course_days) && valuation.course_days.length
			? valuation.course_days.map((day) => ({
					date: String(day?.date || ''),
					effective_hours: String(day?.effective_hours ?? '')
				}))
			: [{ date: '', effective_hours: '' }];
	const isManual = valuation.method === AFC_METHOD.MANUAL || valuation.method === AFC_METHOD.COMMITTEE;
	return createAfcState({
		origin: valuation.origin || AFC_ORIGIN.FES_ARAGON,
		typeKey: valuation.type_key,
		scenarioKey: valuation.scenario_key || '',
		courseDayMode: days.length > 1 ? 'multiple' : 'single',
		courseDays: days,
		manualHours: isManual ? String(valuation.input_value ?? '') : '',
		evidence: event?.afc_evidence ?? null
	});
}

export function describeAfcEventHours(event) {
	if (event?.hours_value === null) return 'Horas pendientes';
	return '';
}
