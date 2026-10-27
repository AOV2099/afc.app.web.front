// 6 meses (hasta 184 días) con 3 sesiones por semana: 26 semanas × 3 + 2 días sueltos.
export const MAX_EVENT_SESSIONS = 80;
export const ATTENDANCE_PERCENT_RANGE = Object.freeze({ min: 50, max: 100, step: 5, default: 80 });

export const WEEKDAY_OPTIONS = Object.freeze([
	{ value: 1, short: 'L', name: 'Lunes' },
	{ value: 2, short: 'M', name: 'Martes' },
	{ value: 3, short: 'Mi', name: 'Miércoles' },
	{ value: 4, short: 'J', name: 'Jueves' },
	{ value: 5, short: 'V', name: 'Viernes' },
	{ value: 6, short: 'S', name: 'Sábado' },
	{ value: 0, short: 'D', name: 'Domingo' }
]);

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;
const DAY_MS = 86_400_000;

function pad(value) {
	return String(value).padStart(2, '0');
}

/** Sesiones mínimas para cumplir el porcentaje (asistidas / total >= porcentaje). */
export function requiredSessions(percent, total) {
	const sessions = Math.max(0, Math.trunc(Number(total) || 0));
	if (!sessions) return 0;
	const pct = Math.min(100, Math.max(1, Math.trunc(Number(percent) || 100)));
	return Math.max(1, Math.floor((pct * sessions + 99) / 100));
}

export function describeAttendanceRule(percent, total) {
	if (total <= 1) return 'Debe asistir a la sesión.';
	return `${percent} % · mínimo ${requiredSessions(percent, total)} de ${total} sesiones`;
}

/** Progreso del alumno en eventos de varias sesiones; '' para eventos de una sola sesión. */
// Datos de avance para la vista previa del evento; solo aplica a inscripciones aprobadas de varias sesiones.
export function attendancePreview(entry) {
	const approved = String(entry?.registration?.status || '').toLowerCase() === 'approved';
	if (!approved || entry?.event?.status === 'cancelled' || Number(entry?.attendance?.total) <= 1 || !entry?.attendance) {
		return { attendance: null, sessions: [], hoursValue: null };
	}
	return {
		attendance: entry.attendance,
		sessions: Array.isArray(entry.sessions) ? entry.sessions : [],
		hoursValue: entry.event?.hours_value ?? null
	};
}

// El back rechaza la baja con una asistencia registrada o con otra solicitud de baja en curso.
export function canRequestUnsubscribe(entry) {
	const status = String(entry?.registration?.status || '').toLowerCase();
	if (!['approved', 'pending', 'changes_requested'].includes(status)) return false;
	if (String(entry?.registration?.payload?.cancel_request?.status || '').toLowerCase() === 'pending') return false;
	if (['cancelled', 'ended'].includes(String(entry?.event?.status || '').toLowerCase())) return false;
	if (String(entry?.ticket?.status || '').toLowerCase() === 'used') return false;
	return !(Number(entry?.attendance?.attended) > 0);
}

export function describeAttendanceProgress(attendance) {
	if (!attendance || Number(attendance.total) <= 1) return '';
	const base = `Asistencias: ${attendance.attended} de ${attendance.total}`;
	if (attendance.met) return `${base} · mínimo cumplido`;
	if (attendance.reachable === false) return `${base} · ya no es posible alcanzar el mínimo (${attendance.required})`;
	return `${base} (mínimo ${attendance.required})`;
}

function percentOf(part, total) {
	return total > 0 ? Math.round((part / total) * 100) : 0;
}

/** Avance (porcentaje asistido) y umbral (porcentaje con el que se liberan las horas AFC). */
export function attendanceMeter(attendance) {
	const total = Number(attendance?.total) || 0;
	const attended = Math.min(Number(attendance?.attended) || 0, total);
	const required = Number(attendance?.required) || 0;
	return {
		total,
		attended,
		required,
		progressPercent: percentOf(attended, total),
		thresholdPercent: percentOf(required, total),
		remaining: Math.max(0, required - attended)
	};
}

/** Cuándo se liberan las horas AFC del evento para el alumno. */
export function describeHoursRelease(attendance, hoursValue) {
	const hours = Number(hoursValue) || 0;
	if (!attendance || Number(attendance.total) <= 1) return '';
	if (hours <= 0) return 'Este evento no otorga horas AFC.';
	const { required, total, thresholdPercent, remaining } = attendanceMeter(attendance);
	if (attendance.met) return 'Cumpliste la asistencia mínima: tus horas AFC fueron liberadas.';
	if (attendance.reachable === false) return 'Ya no es posible alcanzar la asistencia mínima; no se liberarán horas AFC.';
	const rule = `Las ${hours} h AFC se liberan al asistir a ${required} de ${total} sesiones (${thresholdPercent} %)`;
	return `${rule}. Te falta${remaining === 1 ? '' : 'n'} ${remaining}.`;
}

export const SESSION_STATE_META = Object.freeze({
	available: { label: 'Disponible', className: 'border-violet-200 bg-violet-50 text-violet-700', dot: 'bg-violet-400' },
	ended: { label: 'Finalizada', className: 'border-slate-200 bg-slate-50 text-slate-500', dot: 'bg-slate-300' },
	attended: { label: 'Asistida', className: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
	missed: { label: 'Sin asistencia', className: 'border-red-200 bg-red-50 text-red-700', dot: 'bg-red-500' },
	in_progress: { label: 'Hoy', className: 'border-amber-200 bg-amber-50 text-amber-800', dot: 'bg-amber-500' },
	upcoming: { label: 'Próxima', className: 'border-blue-200 bg-blue-50 text-blue-700', dot: 'bg-blue-500' },
	pending: { label: 'Solicitud pendiente', className: 'border-slate-200 bg-slate-50 text-slate-600', dot: 'bg-slate-400' },
	cancelled: { label: 'Evento cancelado', className: 'border-slate-200 bg-slate-100 text-slate-500', dot: 'bg-slate-300' }
});

/** Estado que ve el alumno: la inscripción no aprobada o el evento cancelado prevalecen sobre la asistencia. */
export function sessionDisplayState(session, event) {
	if (event?.status === 'cancelled') return 'cancelled';
	if (event?.registration_status && event.registration_status !== 'approved') return 'pending';
	return session?.state || 'upcoming';
}

const DEFAULT_PERIOD_WEEKDAYS = new Set([1, 2, 3, 4, 5]);

/** Configuración del generador semanal: rango de fechas y horario propio por día de la semana. */
export function createSessionPeriod() {
	return {
		startDate: '',
		endDate: '',
		days: WEEKDAY_OPTIONS.map((day) => ({
			weekday: day.value,
			enabled: DEFAULT_PERIOD_WEEKDAYS.has(day.value),
			startTime: '',
			endTime: ''
		}))
	};
}

function dayName(weekday) {
	return WEEKDAY_OPTIONS.find((day) => day.value === weekday)?.name || 'el día';
}

/** Genera las sesiones semanales del periodo; devuelve { rows, error }. */
export function buildPeriodSessions(period) {
	const { startDate, endDate } = period || {};
	if (!DATE_PATTERN.test(startDate || '') || !DATE_PATTERN.test(endDate || '')) {
		return { rows: [], error: 'Selecciona la fecha inicial y la fecha final.' };
	}
	if (endDate < startDate) return { rows: [], error: 'La fecha final debe ser igual o posterior a la inicial.' };
	const enabledDays = (period.days || []).filter((day) => day.enabled);
	if (!enabledDays.length) return { rows: [], error: 'Selecciona al menos un día de la semana.' };
	for (const day of enabledDays) {
		if (!TIME_PATTERN.test(day.startTime || '') || !TIME_PATTERN.test(day.endTime || '')) {
			return { rows: [], error: `Captura el horario del ${dayName(day.weekday).toLowerCase()}.` };
		}
		if (day.endTime <= day.startTime) {
			return { rows: [], error: `El ${dayName(day.weekday).toLowerCase()} la hora de fin debe ser posterior a la de inicio.` };
		}
	}

	const schedule = new Map(enabledDays.map((day) => [day.weekday, day]));
	const start = utcTime(startDate);
	const end = utcTime(endDate);
	const rows = [];
	for (let time = start; time <= end; time += DAY_MS) {
		const slot = schedule.get(new Date(time).getUTCDay());
		if (!slot) continue;
		rows.push({ date: utcDateKey(time), startTime: slot.startTime, endTime: slot.endTime });
	}
	if (rows.length > MAX_EVENT_SESSIONS) {
		return { rows: [], error: `El periodo genera ${rows.length} sesiones y el máximo es ${MAX_EVENT_SESSIONS}.` };
	}
	if (!rows.length) return { rows: [], error: 'No hay días que coincidan con el periodo seleccionado.' };
	return { rows, error: '' };
}

function utcTime(date) {
	const [y, m, d] = date.split('-').map(Number);
	return Date.UTC(y, m - 1, d);
}

function utcDateKey(time) {
	const day = new Date(time);
	return `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`;
}

/** Semanas (lunes a domingo) del mes para el calendario; `month` es 0-11. */
export function buildCalendarMonth(year, month) {
	const first = Date.UTC(year, month, 1);
	const gridStart = first - ((new Date(first).getUTCDay() + 6) % 7) * DAY_MS;
	const weeks = [];
	for (let time = gridStart; weeks.length < 6; ) {
		const week = [];
		for (let i = 0; i < 7; i += 1, time += DAY_MS) {
			const day = new Date(time);
			week.push({ date: utcDateKey(time), day: day.getUTCDate(), inMonth: day.getUTCMonth() === month });
		}
		if (!week.some((day) => day.inMonth)) break;
		weeks.push(week);
	}
	return weeks;
}

/** Agrega la fecha con el horario indicado o la quita si ya estaba. */
export function toggleSessionDate(rows, date, { startTime = '', endTime = '' } = {}) {
	if (!DATE_PATTERN.test(date || '')) return rows;
	if (rows.some((row) => row.date === date)) return rows.filter((row) => row.date !== date);
	if (rows.length >= MAX_EVENT_SESSIONS) return rows;
	return sortSessionRows([...rows, { date, startTime, endTime }]);
}

export function sortSessionRows(rows) {
	return [...rows].sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));
}

function localIso(date, time) {
	if (!DATE_PATTERN.test(date || '') || !TIME_PATTERN.test(time || '')) return null;
	const value = new Date(`${date}T${time}:00`);
	return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

/** Devuelve el primer error de las sesiones o '' si son válidas. */
export function validateSessionRows(rows, { now = Date.now(), allowPast = false } = {}) {
	if (!rows.length) return 'Agrega al menos una sesión.';
	if (rows.length > MAX_EVENT_SESSIONS) {
		return `Hay ${rows.length} sesiones y el evento admite hasta ${MAX_EVENT_SESSIONS}.`;
	}
	const seen = new Set();
	for (const [index, row] of sortSessionRows(rows).entries()) {
		const label = `Sesión ${index + 1}`;
		const startsAt = localIso(row.date, row.startTime);
		const endsAt = localIso(row.date, row.endTime);
		if (!startsAt || !endsAt) return `${label}: captura fecha, hora de inicio y hora de fin.`;
		if (endsAt <= startsAt) return `${label}: la hora de fin debe ser posterior a la de inicio.`;
		if (!allowPast && new Date(startsAt).getTime() < now) return `${label}: no puede estar en el pasado.`;
		if (seen.has(row.date)) return `Solo puede haber una sesión por día (${row.date}).`;
		seen.add(row.date);
	}
	return '';
}

/** Fecha y duración (horas) de cada sesión, para las jornadas de cursos AFC. */
export function sessionDaysFromRows(rows) {
	return sortSessionRows(rows)
		.filter((row) => DATE_PATTERN.test(row.date || ''))
		.map((row) => {
			const start = localIso(row.date, row.startTime);
			const end = localIso(row.date, row.endTime);
			const minutes = start && end ? (new Date(end).getTime() - new Date(start).getTime()) / 60_000 : 0;
			return { date: row.date, hours: minutes > 0 ? Math.round((minutes / 60) * 100) / 100 : 0 };
		});
}

/** Fecha local y duración (horas) de un evento de una sola sesión; [] si faltan fechas. */
export function sessionDaysFromRange(startsAt, endsAt) {
	const start = new Date(startsAt || '');
	const end = new Date(endsAt || '');
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return [];
	const date = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
	return [{ date, hours: Math.round(((end - start) / 3_600_000) * 100) / 100 }];
}

export function sessionRowsToPayload(rows) {
	return sortSessionRows(rows).map((row, index) => ({
		starts_at: localIso(row.date, row.startTime),
		ends_at: localIso(row.date, row.endTime),
		label: `Sesión ${index + 1}`,
		hours_value: null
	}));
}

function toLocalParts(iso) {
	const value = new Date(iso);
	if (Number.isNaN(value.getTime())) return { date: '', time: '' };
	return {
		date: `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`,
		time: `${pad(value.getHours())}:${pad(value.getMinutes())}`
	};
}

export function sessionRowsFromEvent(sessions) {
	return sortSessionRows(
		(Array.isArray(sessions) ? sessions : []).map((session) => {
			const start = toLocalParts(session?.starts_at);
			const end = toLocalParts(session?.ends_at);
			return {
				date: start.date,
				startTime: start.time,
				endTime: end.time,
				...(session?.has_checkins ? { locked: true } : {})
			};
		})
	);
}
