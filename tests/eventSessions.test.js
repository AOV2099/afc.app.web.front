import assert from 'node:assert/strict';
import test from 'node:test';

import {
	MAX_EVENT_SESSIONS,
	attendanceMeter,
	buildCalendarMonth,
	buildPeriodSessions,
	createSessionPeriod,
	describeAttendanceProgress,
	describeAttendanceRule,
	describeHoursRelease,
	requiredSessions,
	sessionDisplayState,
	sessionRowsFromEvent,
	sessionDaysFromRows,
	sessionRowsToPayload,
	toggleSessionDate,
	validateSessionRows
} from '../src/lib/utils/eventSessions.js';

test('required sessions round up so attended/total meets the percentage', () => {
	assert.equal(requiredSessions(80, 5), 4);
	assert.equal(requiredSessions(80, 4), 4, '3/4 = 75 % no alcanza 80 %');
	assert.equal(requiredSessions(50, 2), 1);
	assert.equal(requiredSessions(65, 3), 2);
	assert.equal(requiredSessions(70, 3), 3);
	assert.equal(requiredSessions(100, 7), 7);
	assert.equal(requiredSessions(80, 1), 1);
	assert.equal(requiredSessions(80, 0), 0);
	assert.equal(describeAttendanceRule(80, 5), '80 % · mínimo 4 de 5 sesiones');
});

test('student attendance progress is described only for multi-session events', () => {
	assert.equal(describeAttendanceProgress({ attended: 1, total: 1, required: 1, met: true }), '');
	assert.equal(
		describeAttendanceProgress({ attended: 2, total: 5, required: 4, met: false, reachable: true }),
		'Asistencias: 2 de 5 (mínimo 4)'
	);
	assert.equal(
		describeAttendanceProgress({ attended: 4, total: 5, required: 4, met: true, reachable: true }),
		'Asistencias: 4 de 5 · mínimo cumplido'
	);
	assert.match(
		describeAttendanceProgress({ attended: 1, total: 5, required: 4, met: false, reachable: false }),
		/ya no es posible/u
	);
});

test('students see their progress and the attendance that releases the AFC hours', () => {
	const attendance = { attended: 3, total: 10, required: 8, met: false, reachable: true };
	assert.deepEqual(attendanceMeter(attendance), {
		total: 10,
		attended: 3,
		required: 8,
		progressPercent: 30,
		thresholdPercent: 80,
		remaining: 5
	});
	assert.equal(
		describeHoursRelease(attendance, 20),
		'Las 20 h AFC se liberan al asistir a 8 de 10 sesiones (80 %). Te faltan 5.'
	);
	assert.match(describeHoursRelease({ ...attendance, attended: 7 }, 20), /Te falta 1\.$/u);
	assert.match(describeHoursRelease({ ...attendance, attended: 8, met: true }, 20), /fueron liberadas/u);
	assert.match(describeHoursRelease({ ...attendance, reachable: false }, 20), /no se liberarán/u);
	assert.equal(describeHoursRelease(attendance, 0), 'Este evento no otorga horas AFC.');
	assert.equal(describeHoursRelease({ attended: 0, total: 1, required: 1 }, 5), '', 'una sola sesión: sin barra');

	const session = { state: 'missed' };
	assert.equal(sessionDisplayState(session, { registration_status: 'approved', status: 'published' }), 'missed');
	assert.equal(sessionDisplayState(session, { registration_status: 'pending', status: 'published' }), 'pending');
	assert.equal(sessionDisplayState(session, { registration_status: 'approved', status: 'cancelled' }), 'cancelled');
});

function period({ startDate, endDate, schedule }) {
	const base = createSessionPeriod();
	return {
		...base,
		startDate,
		endDate,
		days: base.days.map((day) => ({ ...day, enabled: false, ...(schedule[day.weekday] || {}) }))
	};
}

test('sessions are generated on the selected weekdays, each with its own schedule', () => {
	// 2026-10-19 es lunes.
	const { rows, error } = buildPeriodSessions(
		period({
			startDate: '2026-10-19',
			endDate: '2026-10-30',
			schedule: {
				1: { enabled: true, startTime: '10:00', endTime: '12:00' },
				3: { enabled: true, startTime: '16:00', endTime: '18:00' }
			}
		})
	);
	assert.equal(error, '');
	assert.deepEqual(rows, [
		{ date: '2026-10-19', startTime: '10:00', endTime: '12:00' },
		{ date: '2026-10-21', startTime: '16:00', endTime: '18:00' },
		{ date: '2026-10-26', startTime: '10:00', endTime: '12:00' },
		{ date: '2026-10-28', startTime: '16:00', endTime: '18:00' }
	]);
});

test('specific dates are toggled from the calendar with the default schedule', () => {
	const times = { startTime: '10:00', endTime: '12:00' };
	let rows = toggleSessionDate([], '2026-11-12', times);
	rows = toggleSessionDate(rows, '2026-11-03', { startTime: '16:00', endTime: '18:00' });
	assert.deepEqual(rows, [
		{ date: '2026-11-03', startTime: '16:00', endTime: '18:00' },
		{ date: '2026-11-12', startTime: '10:00', endTime: '12:00' }
	]);
	assert.deepEqual(toggleSessionDate(rows, '2026-11-03', times), [{ date: '2026-11-12', startTime: '10:00', endTime: '12:00' }]);
	const full = Array.from({ length: MAX_EVENT_SESSIONS }, (_, i) => ({ date: `2027-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`, ...times }));
	assert.equal(toggleSessionDate(full, '2027-06-01', times), full);
});

test('calendar months start on Monday and only include weeks of the month', () => {
	// Noviembre 2026 inicia en domingo: la primera semana empieza el lunes 26 de octubre.
	const weeks = buildCalendarMonth(2026, 10);
	assert.equal(weeks.length, 6);
	assert.deepEqual(weeks[0][0], { date: '2026-10-26', day: 26, inMonth: false });
	assert.deepEqual(weeks[0][6], { date: '2026-11-01', day: 1, inMonth: true });
	assert.equal(weeks[5][0].date, '2026-11-30');
	assert.equal(buildCalendarMonth(2027, 1).length, 4, 'febrero 2027 inicia en lunes y ocupa 4 semanas');
});

test('the period explains what is missing before generating', () => {
	const monday = { 1: { enabled: true, startTime: '10:00', endTime: '12:00' } };
	assert.match(buildPeriodSessions(createSessionPeriod()).error, /fecha inicial/u);
	assert.match(buildPeriodSessions(period({ startDate: '2026-10-30', endDate: '2026-10-19', schedule: monday })).error, /posterior/u);
	assert.match(buildPeriodSessions(period({ startDate: '2026-10-19', endDate: '2026-10-30', schedule: {} })).error, /al menos un día/u);
	assert.match(
		buildPeriodSessions(period({ startDate: '2026-10-19', endDate: '2026-10-30', schedule: { 2: { enabled: true, startTime: '10:00', endTime: '' } } })).error,
		/horario del martes/u
	);
	assert.match(
		buildPeriodSessions(period({ startDate: '2026-10-20', endDate: '2026-10-20', schedule: monday })).error,
		/No hay días/u
	);
});

test('a period beyond the session cap is rejected', () => {
	const everyDay = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((day) => [day, { enabled: true, startTime: '09:00', endTime: '10:00' }]));
	const result = buildPeriodSessions(period({ startDate: '2027-01-01', endDate: '2027-12-31', schedule: everyDay }));
	assert.deepEqual(result.rows, []);
	assert.equal(result.error, `El periodo genera 365 sesiones y el máximo es ${MAX_EVENT_SESSIONS}.`);
});

test('session rows are validated before saving', () => {
	const now = new Date('2026-10-01T00:00:00').getTime();
	const ok = [
		{ date: '2026-10-20', startTime: '10:00', endTime: '12:00' },
		{ date: '2026-10-19', startTime: '10:00', endTime: '12:00' }
	];
	assert.equal(validateSessionRows(ok, { now }), '');
	assert.match(validateSessionRows([], { now }), /al menos una sesión/u);
	assert.match(validateSessionRows([{ date: '2026-10-19', startTime: '12:00', endTime: '10:00' }], { now }), /posterior/u);
	assert.match(validateSessionRows([{ date: '2026-10-19', startTime: '', endTime: '10:00' }], { now }), /captura/u);
	assert.match(validateSessionRows([...ok, { date: '2026-10-19', startTime: '15:00', endTime: '16:00' }], { now }), /una sesión por día/u);
	assert.match(validateSessionRows([{ date: '2026-09-01', startTime: '10:00', endTime: '12:00' }], { now }), /pasado/u);
});

test('payload is sorted and labeled, and round-trips from saved sessions', () => {
	assert.deepEqual(
		sessionDaysFromRows([
			{ date: '2026-10-21', startTime: '10:00', endTime: '11:30' },
			{ date: '2026-10-19', startTime: '16:00', endTime: '18:00' },
			{ date: '', startTime: '09:00', endTime: '10:00' }
		]),
		[
			{ date: '2026-10-19', hours: 2 },
			{ date: '2026-10-21', hours: 1.5 }
		]
	);
	const payload = sessionRowsToPayload([
		{ date: '2026-10-21', startTime: '10:00', endTime: '12:00' },
		{ date: '2026-10-19', startTime: '09:30', endTime: '11:00' }
	]);
	assert.deepEqual(payload.map((session) => session.label), ['Sesión 1', 'Sesión 2']);
	assert.equal(payload[0].starts_at, new Date('2026-10-19T09:30:00').toISOString());
	assert.equal(payload[1].hours_value, null);
	assert.deepEqual(sessionRowsFromEvent(payload), [
		{ date: '2026-10-19', startTime: '09:30', endTime: '11:00' },
		{ date: '2026-10-21', startTime: '10:00', endTime: '12:00' }
	]);
});
