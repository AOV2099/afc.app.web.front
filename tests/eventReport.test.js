import assert from 'node:assert/strict';
import test from 'node:test';

import {
	buildEventReportCsv,
	careerBreakdown,
	eventReportFilename,
	formatCheckinDateTime,
	summarizeEventReport
} from '../src/lib/utils/eventReport.js';

test('check-in times are shown in Mexico City time, blank when missing', () => {
	assert.equal(formatCheckinDateTime('2026-11-06T21:06:00.000Z'), '06/11/2026, 15:06');
	assert.equal(formatCheckinDateTime(null), '');
	assert.equal(formatCheckinDateTime('no es fecha'), '');
});

test('event report CSV has one row per registrant and blanks for missing data', () => {
	const csv = buildEventReportCsv([
		{
			numero_cuenta: '320312252',
			correo: 'ana@aragon.unam.mx',
			carrera: 'Ingeniería Civil',
			check_in: true,
			checkins: ['2026-11-06T21:04:00.000Z', '2026-11-07T21:02:00.000Z']
		},
		{ numero_cuenta: null, correo: 'qa@afc.local', carrera: null, check_in: false, checkins: [] }
	]);
	assert.equal(
		csv,
		'\uFEFFnumero_cuenta,correo,carrera,check_in,fecha_hora_check_in\n' +
			'320312252,ana@aragon.unam.mx,Ingeniería Civil,Sí,"06/11/2026, 15:04 | 07/11/2026, 15:02"\n' +
			',qa@afc.local,,No,\n'
	);
});

test('event report file name includes the event id and Mexico City date', () => {
	assert.equal(eventReportFilename(756, new Date('2026-11-07T05:30:00.000Z')), 'reporte-evento-756-2026-11-06.csv');
});

const ROWS = [
	{ carrera: 'Ingeniería Civil', check_in: true },
	{ carrera: 'Ingeniería Civil', check_in: false },
	{ carrera: 'Ingeniería Civil', check_in: true },
	{ carrera: 'Derecho', check_in: true },
	{ carrera: null, check_in: false }
];

test('summary compares registrants against attendance', () => {
	assert.deepEqual(summarizeEventReport(ROWS), { registered: 5, attended: 3, absent: 2, rate: 60 });
	assert.deepEqual(summarizeEventReport(null), { registered: 0, attended: 0, absent: 0, rate: 0 });
});

test('career breakdown groups registrants and attendance, with blank careers together', () => {
	assert.deepEqual(careerBreakdown(ROWS), [
		{ career: 'Ingeniería Civil', registered: 3, attended: 2, rate: 67 },
		{ career: 'Derecho', registered: 1, attended: 1, rate: 100 },
		{ career: 'Sin carrera', registered: 1, attended: 0, rate: 0 }
	]);
});
