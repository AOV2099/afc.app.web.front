import QRCode from 'qrcode';

const DEFAULT_QR_OPTIONS = Object.freeze({
	width: 280,
	margin: 1,
	color: {
		dark: '#0f172a',
		light: '#ffffff'
	}
});

export async function createQrDataUrl(value, options = {}) {
	const content = String(value || '').trim();
	if (!content) return null;

	return QRCode.toDataURL(content, {
		...DEFAULT_QR_OPTIONS,
		...(options || {})
	});
}

export async function createTicketQrDataUrl(ticketCode, options = {}) {
	return createQrDataUrl(ticketCode, options);
}
