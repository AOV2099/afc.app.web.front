export const STUDENT_CSV_MAX_BYTES = 2 * 1024 * 1024;
export const STUDENT_CSV_MAX_ROWS = 1000;
export const STUDENT_CSV_TEMPLATE_FILENAME = 'plantilla-estudiantes-afc.csv';
export const STUDENT_CSV_TEMPLATE = '\uFEFFnombres,apellidos,correo,numero_cuenta\n';

export function validateStudentCsvFile(file) {
	if (!file) return 'Selecciona un archivo CSV.';
	if (!String(file.name || '').toLowerCase().endsWith('.csv')) {
		return 'El archivo debe tener extensión .csv.';
	}
	if (!Number.isFinite(file.size) || file.size <= 0) return 'El archivo CSV está vacío.';
	if (file.size > STUDENT_CSV_MAX_BYTES) {
		return 'El archivo CSV no puede exceder 2 MB.';
	}
	return '';
}

export function validateStudentCsvText(csvText) {
	return String(csvText ?? '').replace(/^\uFEFF/u, '').trim()
		? ''
		: 'El archivo CSV está vacío.';
}

export function normalizeStudentCsvErrors(error, fallbackMessage = 'No se pudo procesar la importación.') {
	const errors = Array.isArray(error?.data?.errors) ? error.data.errors : [];
	if (errors.length === 0) {
		return [
			{
				row: '—',
				field: 'archivo',
				message: error?.message || fallbackMessage
			}
		];
	}

	return errors.map((item) => ({
		row: item?.row ?? '—',
		field: String(item?.field || 'archivo'),
		message: String(item?.message || fallbackMessage)
	}));
}
