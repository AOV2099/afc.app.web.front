import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { chromium, expect, test } from '@playwright/test';
import QRCode from 'qrcode';
import { apiLogin } from './helpers/session.js';

/*
 * Verificar constancia: el admin escanea el QR con la cámara (cámara simulada de Chromium que
 * reproduce un QR), pasa a la ficha del alumno y regresa a la cámara con el botón o con «atrás».
 */

const env = process.env;
const DB_CONTAINER = env.AFC_E2E_DB_CONTAINER || 'postgres-afc';

let admin;
let visitor;
let folio;

function sql(statement) {
	return execFileSync('docker', ['exec', DB_CONTAINER, 'psql', '-U', 'afc', '-d', 'afc', '-tAc', statement], {
		encoding: 'utf8'
	}).trim();
}

/** Video Y4M (escala de grises) con el QR al centro, para --use-file-for-fake-video-capture. */
function writeQrVideo(path, text, width = 640, height = 480) {
	const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
	const modules = qr.modules.size + 8;
	const scale = Math.floor((Math.min(width, height) * 0.7) / modules);
	const offsetX = Math.floor((width - modules * scale) / 2);
	const offsetY = Math.floor((height - modules * scale) / 2);
	const luma = Buffer.alloc(width * height, 235);
	for (let row = 0; row < qr.modules.size; row += 1) {
		for (let col = 0; col < qr.modules.size; col += 1) {
			if (!qr.modules.data[row * qr.modules.size + col]) continue;
			for (let dy = 0; dy < scale; dy += 1) {
				const y = offsetY + (row + 4) * scale + dy;
				luma.fill(16, y * width + offsetX + (col + 4) * scale, y * width + offsetX + (col + 5) * scale);
			}
		}
	}
	const chroma = Buffer.alloc((width / 2) * (height / 2) * 2, 128);
	const frame = Buffer.concat([Buffer.from('FRAME\n'), luma, chroma]);
	fs.writeFileSync(
		path,
		Buffer.concat([Buffer.from(`YUV4MPEG2 W${width} H${height} F15:1 Ip A1:1 C420jpeg\n`), ...Array(15).fill(frame)])
	);
}

test.beforeAll(async () => {
	admin = await apiLogin(env.AFC_E2E_ADMIN_EMAIL, env.AFC_E2E_ADMIN_PASSWORD);
	const list = await (await admin.get(`/api/admin/users?q=${encodeURIComponent(env.AFC_E2E_VISITOR_EMAIL)}`)).json();
	visitor = (list.users || [])[0];
	expect((await admin.get(`/api/admin/users/${visitor.id}/constancia`)).status(), 'el alumno de prueba debe poder obtener constancia').toBe(200);
	folio = sql(`SELECT code FROM afc_constancias WHERE user_id = ${Number(visitor.id)}`);
	expect(folio).toMatch(/^AFC-/);
});

test.afterAll(async () => {
	await admin?.dispose();
});

test('al escanear el QR pasa a la ficha del alumno y se regresa a la cámara', async ({}, testInfo) => {
	const video = testInfo.outputPath('constancia-qr.y4m');
	fs.mkdirSync(testInfo.outputDir, { recursive: true });
	writeQrVideo(video, folio);

	const browser = await chromium.launch({
		args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`]
	});
	const context = await browser.newContext({
		baseURL: env.AFC_E2E_BASE_URL,
		ignoreHTTPSErrors: true,
		viewport: { width: 390, height: 844 },
		permissions: ['camera'],
		storageState: await admin.storageState()
	});
	const page = await context.newPage();
	await page.goto('/admin/constancias');

	const detail = page.getByTestId('constancia-detail');
	await expect(detail).toBeVisible({ timeout: 20_000 });
	await expect(detail).toContainText(folio);
	await expect(detail).toContainText(visitor.student_id);
	await expect(detail).toContainText('Constancia válida');
	await expect(detail.getByRole('listitem')).toHaveCount(8);
	await expect(page).toHaveURL(/\/admin\/constancias$/);

	await detail.getByRole('button', { name: 'Volver a la cámara' }).click();
	await expect(page.getByTestId('constancia-scanner')).toBeVisible();
	await expect(detail).toBeHidden();

	// La cámara se reactiva y vuelve a leer el QR; el «atrás» del navegador también regresa.
	await expect(detail).toBeVisible({ timeout: 20_000 });
	await page.goBack();
	await expect(page.getByTestId('constancia-scanner')).toBeVisible();
	await expect(page).toHaveURL(/\/admin\/constancias$/);
	await browser.close();
});

test('el folio se puede capturar a mano y los folios inexistentes se rechazan', async ({ browser }) => {
	const context = await browser.newContext({ ignoreHTTPSErrors: true, storageState: await admin.storageState() });
	const page = await context.newPage();
	await page.goto('/admin/constancias');
	const input = page.getByLabel('Folio de la constancia');
	const submit = page.getByTestId('constancia-scanner').getByRole('button', { name: 'Verificar', exact: true });

	await input.fill('AFC-0000-0000-0000');
	await submit.click();
	await expect(page.getByText('No existe una constancia con este folio.')).toBeVisible();

	await input.fill(folio.toLowerCase());
	await submit.click();
	await expect(page.getByTestId('constancia-detail')).toContainText(folio);
	await context.close();
});

test('solo los administradores pueden consultar folios', async () => {
	const student = await apiLogin(env.AFC_E2E_VISITOR_EMAIL, env.AFC_E2E_VISITOR_PASSWORD);
	expect((await student.get(`/api/admin/constancias/${folio}`)).status()).toBe(403);
	await student.dispose();
	expect((await admin.get('/api/admin/constancias/no-es-folio')).status()).toBe(400);
});
