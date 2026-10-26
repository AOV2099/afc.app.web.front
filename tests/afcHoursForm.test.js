import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
	afcStateFromEvent,
	buildAfcValuationPayload,
	changeAfcScenario,
	changeAfcType,
	computeAfcPreview,
	createAfcState,
	describeAfcEventHours,
	eventGrantsAfcHours,
	formatAfcRange,
	formatAfcScenarioOption,
	getAfcTypesForOrigin,
	syncCourseDaysWithSessions,
	validateAfcForSave
} from '../src/lib/utils/afcHoursForm.js';

const scenario = (id, key, kind, values = {}) => ({
	id,
	key,
	label: key,
	kind,
	percent: null,
	fixed_hours: null,
	is_active: true,
	...values
});

const CATALOG = [
	{
		id: '1', origin: 'fes_aragon', key: 'conferences', name: 'Conferencias',
		min_hours: '10.00', max_hours: '50.00', valuation_mode: 'scenarios', is_active: true,
		scenarios: [
			scenario('10', 'conf_internal_attendance', 'percent', { percent: '20.0000' }),
			scenario('11', 'conf_unam_authorities', 'percent', { percent: '50.0000' }),
			scenario('12', 'conf_retired', 'percent', { percent: '90.0000', is_active: false })
		]
	},
	{
		id: '4', origin: 'fes_aragon', key: 'courses', name: 'Talleres y cursos',
		min_hours: null, max_hours: '150.00', valuation_mode: 'scenarios', is_active: true, multi_session: true,
		scenarios: [
			scenario('40', 'course_defined_duration', 'course_duration'),
			scenario('41', 'course_ref_basic', 'fixed_hours', { fixed_hours: '20.00' })
		]
	},
	{
		id: '9', origin: 'fes_aragon', key: 'cultural', name: 'Actividades culturales',
		min_hours: '20.00', max_hours: '100.00', valuation_mode: 'manual', is_active: true, scenarios: []
	},
	{
		id: '16', origin: 'fes_aragon', key: 'committee', name: 'Comité de Carrera',
		min_hours: null, max_hours: null, valuation_mode: 'committee', is_active: true, scenarios: []
	},
	{
		id: '20', origin: 'external', key: 'ext_museum', name: 'Museos',
		min_hours: '20.00', max_hours: '30.00', valuation_mode: 'manual', is_active: true, scenarios: []
	}
];
const opts = (extra = {}) => ({ catalog: CATALOG, ...extra });
const selected = (typeKey, scenarioKey = '', extra = {}) => createAfcState({ typeKey, scenarioKey, ...extra });

test('starts unselected with FES Aragón as origin', () => {
	const state = createAfcState();
	assert.equal(state.origin, 'fes_aragon');
	assert.equal(computeAfcPreview(state, opts()).status, 'unselected');
	assert.equal(buildAfcValuationPayload(state, opts()), null);
	assert.equal(computeAfcPreview(selected('ext_museum'), opts()).status, 'unselected', 'otro origen');
});

test('percent scenarios interpolate between minimum and maximum', () => {
	const preview = computeAfcPreview(selected('conferences', 'conf_unam_authorities'), opts());
	assert.equal(preview.status, 'calculated');
	assert.equal(preview.valuation.final_hours, 30);
	assert.equal(computeAfcPreview(selected('conferences', 'conf_internal_attendance'), opts()).valuation.final_hours, 18);
	assert.equal(formatAfcRange(preview.type), '10–50 h');
	assert.equal(formatAfcScenarioOption(preview.type, preview.scenario), 'conf_unam_authorities — 50 % → 30 h');
	assert.equal(computeAfcPreview(selected('conferences', 'conf_retired'), opts()).status, 'unselected');
});

test('course duration is calculated automatically from effective hours', () => {
	const state = selected('courses', 'course_defined_duration', {
		courseDayMode: 'multiple',
		courseDays: [
			{ date: '2026-11-01', effective_hours: '4' },
			{ date: '2026-11-02', effective_hours: '12' }
		]
	});
	assert.equal(computeAfcPreview(state, opts()).valuation.final_hours, 28);
	assert.equal(computeAfcPreview(selected('courses', 'course_ref_basic'), opts()).valuation.final_hours, 20);

	const empty = computeAfcPreview(selected('courses', 'course_defined_duration'), opts());
	assert.equal(empty.status, 'incomplete');
});

test('manual and committee types use free hours with evidence', () => {
	assert.equal(computeAfcPreview(selected('cultural', '', { manualHours: '45' }), opts()).valuation.final_hours, 45);
	assert.equal(computeAfcPreview(selected('cultural', '', { manualHours: '5' }), opts()).status, 'invalid');
	assert.equal(computeAfcPreview(selected('cultural'), opts()).status, 'incomplete');

	const committee = selected('committee', '', { manualHours: '120' });
	assert.match(validateAfcForSave(committee, opts({ status: 'published' })).message, /Comité/u);
	assert.equal(
		validateAfcForSave({ ...committee, evidence: { id: 3 } }, opts({ status: 'published' })).ok,
		true
	);
});

test('payload sends selection and inputs, never calculated results', () => {
	assert.deepEqual(buildAfcValuationPayload(selected('conferences', 'conf_unam_authorities'), opts()), {
		origin: 'fes_aragon',
		type_key: 'conferences',
		scenario_key: 'conf_unam_authorities'
	});
	assert.deepEqual(
		buildAfcValuationPayload(
			selected('courses', 'course_defined_duration', { courseDays: [{ date: 'x', effective_hours: ' 4 ' }] }),
			opts({ defaultDate: '2026-11-01' })
		),
		{
			origin: 'fes_aragon',
			type_key: 'courses',
			scenario_key: 'course_defined_duration',
			course_days: [{ date: '2026-11-01', effective_hours: '4' }]
		}
	);
	assert.deepEqual(
		buildAfcValuationPayload(selected('cultural', '', { manualHours: '45', evidence: { id: 9 } }), opts()),
		{ origin: 'fes_aragon', type_key: 'cultural', manual_hours: '45', evidence_file_id: 9 }
	);
	assert.equal(buildAfcValuationPayload(selected('conferences'), opts()), null);
});

test('changing type clears scenario, inputs and evidence', () => {
	const state = selected('cultural', '', { manualHours: '45', evidence: { id: 9 } });
	const changed = changeAfcType(state, 'conferences');
	assert.equal(changed.scenarioKey, '');
	assert.equal(changed.manualHours, '');
	assert.equal(changed.evidence, null);
	const scenarioChanged = changeAfcScenario(
		selected('courses', 'course_defined_duration', { courseDays: [{ date: '', effective_hours: '4' }] }),
		'course_ref_basic'
	);
	assert.deepEqual(scenarioChanged.courseDays, [{ date: '', effective_hours: '' }]);
});

test('incomplete hours require draft status; legacy events keep their hours', () => {
	assert.match(validateAfcForSave(selected('cultural'), opts({ status: 'published' })).message, /borrador/u);
	assert.equal(validateAfcForSave(selected('cultural'), opts({ status: 'draft' })).ok, true);
	assert.equal(validateAfcForSave(createAfcState(), opts({ status: 'published' })).ok, false);
	assert.equal(validateAfcForSave(createAfcState(), opts({ status: 'published', legacyHours: '3.00' })).ok, true);
	assert.match(validateAfcForSave(selected('conferences'), opts()).message, /supuesto/u);
});

test('restores selections and evidence from a saved event', () => {
	const event = {
		hours_value: '45.00',
		afc_valuation: {
			origin: 'fes_aragon',
			type_key: 'cultural',
			scenario_key: null,
			method: 'manual',
			input_value: '45'
		},
		afc_evidence: { id: 3, original_name: 'constancia.pdf' }
	};
	const state = afcStateFromEvent(event);
	assert.equal(state.typeKey, 'cultural');
	assert.equal(state.manualHours, '45');
	assert.equal(state.evidence.id, 3);
	assert.equal(afcStateFromEvent({ hours_value: '3.00' }).typeKey, '');
	assert.equal(describeAfcEventHours({ hours_value: null }), 'Horas pendientes');
	assert.equal(describeAfcEventHours({ hours_value: '8.00' }), '');
});

test('origin select is disabled and self check-in / geofence UI are not editable', async () => {
	const section = await readFile(new URL('../src/lib/components/AfcHoursSection.svelte', import.meta.url), 'utf8');
	assert.match(section, /name="afc_origin"[^>]*disabled>/u);
	const create = await readFile(new URL('../src/lib/pages/CreateEvent.svelte', import.meta.url), 'utf8');
	assert.match(create, /<!--\s*\n\s*Self check-in oculto/u);
	assert.match(create, /aria-label="Geocerca obligatoria" bind:checked=\{form\.geoEnforced\} disabled/u);
});

test('events saved with 0 hrs and no valuation do not grant AFC hours', () => {
	assert.equal(eventGrantsAfcHours(null), true);
	assert.equal(eventGrantsAfcHours({ hours_value: null }), true);
	assert.equal(eventGrantsAfcHours({ hours_value: '4.00' }), true);
	assert.equal(eventGrantsAfcHours({ hours_value: '0.00' }), false);
	assert.equal(eventGrantsAfcHours({ hours_value: '0.00', afc_valuation: { type_key: 'stands' } }), true);
});

test('multi-session events only list activities marked as multi-session', () => {
	assert.deepEqual(
		getAfcTypesForOrigin(CATALOG, 'fes_aragon', { multiSession: true }).map((type) => type.key),
		['courses']
	);
	assert.equal(getAfcTypesForOrigin(CATALOG, 'fes_aragon').length, 4);
});

test('course hours are always the duration of the event sessions', () => {
	const state = selected('courses', 'course_defined_duration', {
		courseDayMode: 'multiple',
		courseDays: [{ date: '2026-10-19', effective_hours: '1.5' }]
	});
	const synced = syncCourseDaysWithSessions(state, [
		{ date: '2026-10-19', hours: 2 },
		{ date: '2026-10-20', hours: 2 }
	]);
	assert.deepEqual(synced.courseDays, [
		{ date: '2026-10-19', effective_hours: '2' },
		{ date: '2026-10-20', effective_hours: '2' }
	]);
	assert.equal(syncCourseDaysWithSessions(synced, [{ date: '2026-10-19', hours: 2 }, { date: '2026-10-20', hours: 2 }]), synced);
	assert.equal(computeAfcPreview(synced, opts()).valuation.final_hours, 8);

	const rescheduled = syncCourseDaysWithSessions(synced, [
		{ date: '2026-10-19', hours: 3 },
		{ date: '2026-10-20', hours: 2.5 }
	]);
	assert.deepEqual(
		buildAfcValuationPayload(rescheduled, opts()).course_days,
		[
			{ date: '2026-10-19', effective_hours: '3' },
			{ date: '2026-10-20', effective_hours: '2.5' }
		]
	);

	const noSchedule = syncCourseDaysWithSessions(rescheduled, []);
	assert.equal(computeAfcPreview(noSchedule, opts()).status, 'incomplete', 'sin horario las horas quedan pendientes');
});
