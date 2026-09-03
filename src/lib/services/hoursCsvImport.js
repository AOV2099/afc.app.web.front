export const HOURS_CSV_MAX_BYTES = 2 * 1024 * 1024;
export const HOURS_CSV_MAX_ROWS = 1000;
export const HOURS_CSV_TEMPLATE_FILENAME = 'plantilla-carga-horas-afc.csv';
export const HOURS_CSV_TEMPLATE = '\uFEFFnumero_cuenta,horas,motivo\n';

export function validateHoursCsvFile(file) {
	if (!file) return 'Selecciona un archivo CSV.';
	if (!String(file.name || '').toLowerCase().endsWith('.csv')) {
		return 'El archivo debe tener extensión .csv.';
	}
	if (!Number.isFinite(file.size) || file.size <= 0) return 'El archivo CSV está vacío.';
	if (file.size > HOURS_CSV_MAX_BYTES) return 'El archivo CSV no puede exceder 2 MB.';
	return '';
}

export function validateHoursCsvText(csvText) {
	return String(csvText ?? '').replace(/^\uFEFF/u, '').trim() ? '' : 'El archivo CSV está vacío.';
}

export function normalizeHoursCsvErrors(error) {
	const errors = Array.isArray(error?.data?.errors) ? error.data.errors : [];
	if (errors.length === 0) {
		return [{ row: '—', field: 'archivo', message: error?.message || 'No se pudo procesar el CSV.' }];
	}
	return errors.map((item) => ({
		row: item?.row ?? '—',
		field: String(item?.field || 'archivo'),
		message: String(item?.message || 'Dato inválido.')
	}));
}