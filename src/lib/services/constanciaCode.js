// Mismo alfabeto que el back (Base32 de Crockford, sin I, L, O ni U).
const CODE_IN_TEXT = /AFC-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}/i;

/** Folio de constancia contenido en el texto del QR (o escrito a mano), o null si no hay uno. */
export function extractConstanciaCode(text) {
	const match = String(text ?? '').match(CODE_IN_TEXT);
	return match ? match[0].toUpperCase() : null;
}
