import { buildCsv, mexicoDateKey } from './csv.js';

const CHECKIN_FORMATTER = new Intl.DateTimeFormat('es-MX', {
	timeZone: 'America/Mexico_City',
	day: '2-digit',
	month: '2-digit',
	year: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
	hour12: false
});

/** Fecha y hora del check-in en horario de la Ciudad de México (dd/mm/aaaa, hh:mm). */
export function formatCheckinDateTime(value) {
	if (value === null || value === undefined || value === '') return '';
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? '' : CHECKIN_FORMATTER.format(date);
}

/** Un renglón por inscrito; los datos faltantes quedan en blanco y cada sesión asistida se separa con " | ". */
export function buildEventReportCsv(rows) {
	return buildCsv(
		['numero_cuenta', 'correo', 'carrera', 'check_in', 'fecha_hora_check_in'],
		(Array.isArray(rows) ? rows : []).map((row) => [
			row?.numero_cuenta,
			row?.correo,
			row?.carrera,
			row?.check_in ? 'Sí' : 'No',
			(row?.checkins || []).map(formatCheckinDateTime).join(' | ')
		])
	);
}

export function eventReportFilename(eventId, date = new Date()) {
	return `reporte-evento-${eventId}-${mexicoDateKey(date)}.csv`;
}

export const NO_CAREER_LABEL = 'Sin carrera';

/** Inscritos vs asistencia (al menos un check-in aceptado). */
export function summarizeEventReport(rows) {
	const list = Array.isArray(rows) ? rows : [];
	const attended = list.filter((row) => row?.check_in).length;
	return {
		registered: list.length,
		attended,
		absent: list.length - attended,
		rate: list.length ? Math.round((attended / list.length) * 100) : 0
	};
}

/** Inscritos y asistencia por carrera, de mayor a menor número de inscritos. */
export function careerBreakdown(rows) {
	const byCareer = new Map();
	for (const row of Array.isArray(rows) ? rows : []) {
		const career = row?.carrera || NO_CAREER_LABEL;
		const entry = byCareer.get(career) || { career, registered: 0, attended: 0 };
		entry.registered += 1;
		if (row?.check_in) entry.attended += 1;
		byCareer.set(career, entry);
	}
	return [...byCareer.values()]
		.map((entry) => ({ ...entry, rate: Math.round((entry.attended / entry.registered) * 100) }))
		.sort((a, b) => b.registered - a.registered || a.career.localeCompare(b.career, 'es'));
}
