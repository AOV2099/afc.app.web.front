/** Normaliza URLs web y convierte enlaces compartidos de Google Drive en URLs de imagen. */
export function normalizeWebImageUrl(value) {
	const raw = String(value || '').trim();
	if (!raw) return '';

	let candidate = raw;
	if (raw.startsWith('//')) {
		candidate = `https:${raw}`;
	} else if (!/^https?:\/\//i.test(raw)) {
		if (/^www\./i.test(raw) || /^[a-z0-9.-]+\.[a-z]{2,}(?:\/|$)/i.test(raw)) {
			candidate = `https://${raw}`;
		}
	}

	try {
		const parsed = new URL(candidate);
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';

		if (parsed.hostname === 'drive.google.com' || parsed.hostname === 'www.drive.google.com') {
			const pathId = parsed.pathname.match(/\/(?:file\/d|d)\/([^/]+)/i)?.[1];
			const fileId = pathId || parsed.searchParams.get('id');
			if (fileId) {
				const directImageUrl = new URL('https://drive.google.com/uc');
				directImageUrl.searchParams.set('export', 'view');
				directImageUrl.searchParams.set('id', fileId);
				return directImageUrl.toString();
			}
		}

		return parsed.toString();
	} catch {
		return '';
	}
}