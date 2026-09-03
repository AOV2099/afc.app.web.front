export const EVENT_TIME_ZONE = 'America/Mexico_City';

function localDateKey(value, timeZone = EVENT_TIME_ZONE) {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return null;

	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(date);
	const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	return `${values.year}-${values.month}-${values.day}`;
}

export function isPastEvent(event, now = Date.now()) {
	if (event?.isPast === true) return true;
	if (String(event?.status || '').trim().toLowerCase() === 'ended') return true;

	const rawEndsAt = event?.ends_at ?? event?.endsAt ?? event?.raw?.ends_at;
	if (!rawEndsAt) return false;

	const endsAt = new Date(rawEndsAt).getTime();
	return Number.isFinite(endsAt) && endsAt <= Number(now);
}

export function isVisibleToUser(event, now = Date.now()) {
	const status = String(event?.status || event?.raw?.status || '').trim().toLowerCase();
	if (status === 'ended' || status === 'cancelled') return false;
	if (!isPastEvent(event, now)) return true;

	const rawEndsAt = event?.ends_at ?? event?.endsAt ?? event?.raw?.ends_at;
	if (!rawEndsAt) return false;

	return localDateKey(rawEndsAt) === localDateKey(now);
}

export function isFutureEvent(event, now = Date.now()) {
	const status = String(event?.status || event?.raw?.status || '').trim().toLowerCase();
	if (status === 'ended' || status === 'cancelled') return false;

	const rawStartsAt = event?.starts_at ?? event?.startsAt ?? event?.raw?.starts_at;
	if (!rawStartsAt) return false;

	const startsAt = new Date(rawStartsAt).getTime();
	return Number.isFinite(startsAt) && startsAt > Number(now);
}