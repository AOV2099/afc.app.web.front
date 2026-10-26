import { getEventCategoryMeta } from '../catalogs/eventCategories.js';
import { getEventCategoryIcon } from '../catalogs/eventCategoryIcons.js';

export const EVENT_IMAGE_FALLBACK =
	'https://gaceta.cch.unam.mx/sites/default/files/styles/imagen_articulos_1920x1080/public/2020-07/video_mensaje_1.jpg?h=d1cb525d&itok=4PYz5F61';

export function resolveEventImage(event) {
	return (
		event?.coverImageUrl ||
		event?.cover_image_url ||
		event?.image ||
		event?.image_url ||
		event?.cover_url ||
		event?.attributes?.cover_image_url ||
		event?.attributes?.image_url ||
		EVENT_IMAGE_FALLBACK
	);
}

function validDate(value) {
	const date = value ? new Date(value) : null;
	return date && !Number.isNaN(date.getTime()) ? date : null;
}

function timeLabel(date) {
	return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

/** "19 de octubre · 04:00 p.m." o, con fin, "19 de octubre · 04:00 p.m. – 06:00 p.m.". */
export function formatEventSchedule(startsAt, endsAt = null) {
	const start = validDate(startsAt);
	if (!start) return 'Sin fecha';
	const day = `${start.toLocaleDateString('es-MX', { day: '2-digit' })} de ${start.toLocaleDateString('es-MX', { month: 'long' })}`;
	const end = validDate(endsAt);
	return end ? `${day} · ${timeLabel(start)} – ${timeLabel(end)}` : `${day} · ${timeLabel(start)}`;
}

/** Datos que muestra EventCard; mismo formato en eventos, inicio, calendario y administración. */
export function mapEventToCard(event, overrides = {}) {
	const categoryMeta = getEventCategoryMeta(event?.category || 'general');
	const rawCapacity = event?.capacity ?? event?.attributes?.capacity ?? event?.cupo ?? event?.attributes?.cupo;
	const hasCapacityValue = rawCapacity !== undefined && rawCapacity !== null && rawCapacity !== '';
	const hasCapacity = event?.capacity_enabled === false ? false : hasCapacityValue;
	const hours = Number(event?.hours_value);

	return {
		id: event?.id,
		tag: categoryMeta.label,
		tagClass: categoryMeta.tagClass,
		categoryIcon: getEventCategoryIcon(categoryMeta.iconKey),
		category: categoryMeta.label.toUpperCase(),
		title: event?.title || 'Sin título',
		date: formatEventSchedule(event?.starts_at),
		img: resolveEventImage(event),
		credits: hours > 0 ? `${hours} Hrs.` : null,
		place: event?.location || event?.attributes?.location || 'Sin ubicación',
		organizer: event?.organizer || event?.attributes?.organizer || 'Sin organizador',
		capacity: hasCapacity ? Number(rawCapacity) || 0 : null,
		hasCapacity,
		registrationsCount:
			Number(event?.registrations_count ?? event?.registration_count ?? event?.attributes?.registrations_count ?? 0) || 0,
		description: event?.description || '',
		allowsReapply: event?.resubmission_policy === 'allowed',
		raw: event,
		...overrides
	};
}
