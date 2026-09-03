import assert from 'node:assert/strict';
import test from 'node:test';

import {
	HOURS_CSV_MAX_BYTES,
	HOURS_CSV_TEMPLATE,
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