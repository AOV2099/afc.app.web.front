import assert from 'node:assert/strict';
import test from 'node:test';

import {
	STUDENT_CSV_MAX_BYTES,
	STUDENT_CSV_TEMPLATE,
	normalizeStudentCsvErrors,
	validateStudentCsvFile,
	validateStudentCsvText
} from '../src/lib/services/studentCsvImport.js';

test('template includes a UTF-8 BOM and only the exact headers', () => {
	assert.equal(STUDENT_CSV_TEMPLATE.charCodeAt(0), 0xfeff);
	assert.equal(STUDENT_CSV_TEMPLATE, '\uFEFFnombres,apellidos,correo,numero_cuenta\n');
});

test('file checks require a non-empty CSV no larger than 2 MB', () => {
	assert.equal(validateStudentCsvFile(null), 'Selecciona un archivo CSV.');
	assert.equal(
		validateStudentCsvFile({ name: 'estudiantes.txt', size: 10 }),
		'El archivo debe tener extensión .csv.'
	);
	assert.equal(validateStudentCsvFile({ name: 'estudiantes.csv', size: 0 }), 'El archivo CSV está vacío.');
	assert.equal(validateStudentCsvFile({ name: 'ESTUDIANTES.CSV', size: STUDENT_CSV_MAX_BYTES }), '');
	assert.equal(
		validateStudentCsvFile({ name: 'estudiantes.csv', size: STUDENT_CSV_MAX_BYTES + 1 }),
		'El archivo CSV no puede exceder 2 MB.'
	);
});

test('text checks reject empty content without parsing CSV authoritatively', () => {
	assert.equal(validateStudentCsvText('\uFEFF  \n'), 'El archivo CSV está vacío.');
	assert.equal(validateStudentCsvText('\uFEFFnombres,apellidos,correo,numero_cuenta\n'), '');
});

test('backend row errors are normalized and generic failures get one file error', () => {
	assert.deepEqual(
		normalizeStudentCsvErrors({
			data: { errors: [{ row: 4, field: 'correo', message: 'correo no es válido.' }] }
		}),
		[{ row: 4, field: 'correo', message: 'correo no es válido.' }]
	);
	assert.deepEqual(normalizeStudentCsvErrors(new Error('Servicio no disponible.')), [
		{ row: '—', field: 'archivo', message: 'Servicio no disponible.' }
	]);
});

test('409 commit conflicts preserve backend row reasons for display', () => {
	const error = new Error('Los datos cambiaron durante la importación.');
	error.status = 409;
	error.data = {
		code: 'import_conflict',
		errors: [
			{
				row: 9,
				field: 'correo',
				code: 'email_in_use',
				message: 'El correo ya está asociado con otra cuenta.'
			}
		]
	};

	assert.deepEqual(normalizeStudentCsvErrors(error), [
		{ row: 9, field: 'correo', message: 'El correo ya está asociado con otra cuenta.' }
	]);
});
