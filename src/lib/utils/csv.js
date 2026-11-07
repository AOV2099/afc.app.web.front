// Evita que Excel interprete celdas como fórmulas y escapa comillas/separadores.
export function csvCell(value) {
	let text = String(value ?? '');
	if (/^[=+\-@\t\r]/u.test(text)) text = `'${text}`;
	return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** CSV con BOM (acentos correctos en Excel) y una fila por arreglo de valores. */
export function buildCsv(headers, rows) {
	const lines = [headers, ...(Array.isArray(rows) ? rows : [])].map((row) => row.map(csvCell).join(','));
	return `\uFEFF${lines.map((line) => `${line}\n`).join('')}`;
}

export function downloadCsv(content, filename) {
	if (typeof document === 'undefined') return;
	const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}

export function mexicoDateKey(date = new Date()) {
	return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(date);
}
