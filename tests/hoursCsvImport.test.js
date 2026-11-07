import assert from 'node:assert/strict';
import test from 'node:test';

import {
	HOURS_CSV_MAX_BYTES,
	HOURS_CSV_TEMPLATE,
	buildHoursReportCsv,
	hoursReportFilename,
	normalizeHoursCsvErrors,
	validateHoursCsvFile,
	validateHoursCsvText
} from '../src/lib/services/hoursCsvImport.js';

test('hours template contains BOM and exact headers only', () => {
	assert.equal(HOURS_CSV_TEMPLATE, '\uFEFFnumero_cuenta,horas,motivo\n');
});

test('hours CSV file validation enforces extension, content, and size', () => {
	assert.match(validateHoursCsvFile(null), /Selecciona/u);
	assert.match(validateHoursCsvFile({ name: 'horas.txt', size: 10 }), /\.csv/u);
	assert.match(validateHoursCsvFile({ name: 'horas.csv', size: 0 }), /vacío/u);
	assert.match(validateHoursCsvFile({ name: 'horas.csv', size: HOURS_CSV_MAX_BYTES + 1 }), /2 MB/u);
	assert.equal(validateHoursCsvFile({ name: 'horas.csv', size: 10 }), '');
	assert.equal(validateHoursCsvText('\uFEFFnumero_cuenta,horas,motivo\n'), '');
});

test('hours CSV backend errors preserve row context', () => {
	assert.deepEqual(
		normalizeHoursCsvErrors({ data: { errors: [{ row: 3, field: 'horas', message: 'Inválido' }] } }),
		[{ row: 3, field: 'horas', message: 'Inválido' }]
	);
	assert.equal(normalizeHoursCsvErrors(new Error('Falló'))[0].message, 'Falló');
});

test('hours report CSV lists account, email and added hours, safe for Excel', () => {
	const csv = buildHoursReportCsv([
		{ numero_cuenta: '320226160', correo: 'ana@aragon.unam.mx', horas_agregadas: 100 },
		{ numero_cuenta: '420124929', correo: '=HYPERLINK("x")', horas_agregadas: 0 },
		{ numero_cuenta: '31666024', correo: null, horas_agregadas: 2.5 }
	]);
	assert.equal(
		csv,
		'\uFEFFnumero_cuenta,correo,horas_agregadas\n' +
			'320226160,ana@aragon.unam.mx,100\n' +
			'420124929,"\'=HYPERLINK(""x"")",0\n' +
			'31666024,,2.5\n'
	);
	assert.equal(buildHoursReportCsv(null), '\uFEFFnumero_cuenta,correo,horas_agregadas\n');
});

test('hours report file name uses the Mexico City date', () => {
	assert.equal(hoursReportFilename(new Date('2026-11-06T18:00:00.000Z')), 'hrs-agregadas-2026-11-06.csv');
	assert.equal(hoursReportFilename(new Date('2026-11-07T05:30:00.000Z')), 'hrs-agregadas-2026-11-06.csv');
});