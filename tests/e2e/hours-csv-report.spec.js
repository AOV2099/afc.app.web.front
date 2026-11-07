import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { apiLogin } from './helpers/session.js';

/*
 * Carga de horas por CSV desde Usuarios: diálogo de éxito y reporte descargable.
 * Crea un alumno temporal directo en la BD local (AFC_E2E_DB_CONTAINER, por defecto postgres-afc) y lo borra al final.
 */

const env = process.env;
const RUN_ID = Date.now().toString(36);
const DB_CONTAINER = env.AFC_E2E_DB_CONTAINER || 'postgres-afc';
const STUDENT_EMAIL = `qa-hours-${RUN_ID}@afc.local`;
const STUDENT_ACCOUNT = `9${String(Date.now()).slice(-8)}`;

let admin;
let studentId;

function sql(statement) {
	return execFileSync('docker', ['exec', DB_CONTAINER, 'psql', '-U', 'afc', '-d', 'afc', '-tAc', statement], {
		encoding: 'utf8'
	}).trim();
}

function dbAvailable() {
	try {
		return sql('SELECT 1') === '1';
	} catch {
		return false;
	}
}

function mexicoDay(date = new Date()) {
	return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(date);
}

async function uploadHours(page, hours) {
	const usersLoaded = page.waitForResponse((res) => res.url().includes('/api/admin/users?') && res.ok());
	await page.goto('/admin/users');
	await usersLoaded;
	const dialog = page.getByRole('dialog', { name: 'Cargar horas' });
	// El botón responde hasta que la página termina de cargar el alcance del admin.
	await expect(async () => {
		await page.getByRole('button', { name: 'Cargar horas' }).click();
		await expect(dialog).toBeVisible({ timeout: 1_000 });
	}).toPass();
	await dialog.locator('#hours-import-category').selectOption('culturales');
	await dialog.locator('#hours-import-file').setInputFiles({
		name: 'horas.csv',
		mimeType: 'text/csv',
		buffer: Buffer.from(`numero_cuenta,horas,motivo\n${STUDENT_ACCOUNT},${hours},QA reporte de horas ${RUN_ID}\n`)
	});
	await dialog.getByRole('button', { name: 'Validar archivo' }).click();
	await expect(dialog.getByText('Horas a acreditar')).toBeVisible();
	await dialog.getByRole('button', { name: 'Confirmar carga' }).click();
	await expect(dialog).toBeHidden();
	return page.getByTestId('hours-import-success');
}

async function downloadReport(page, successDialog) {
	const downloadPromise = page.waitForEvent('download');
	await successDialog.getByRole('button', { name: 'Descargar reporte' }).click();
	const download = await downloadPromise;
	return { filename: download.suggestedFilename(), content: fs.readFileSync(await download.path(), 'utf8') };
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
	test.skip(!dbAvailable(), `Sin acceso al contenedor ${DB_CONTAINER}.`);
	admin = await apiLogin(env.AFC_E2E_ADMIN_EMAIL, env.AFC_E2E_ADMIN_PASSWORD);

	studentId = Number(
		sql(`INSERT INTO users (email, password_hash, first_name, last_name, student_id, career_id, status)
		     VALUES ('${STUDENT_EMAIL}', 'qa-sin-acceso', 'QA', 'Horas ${RUN_ID}', '${STUDENT_ACCOUNT}',
		             (SELECT id FROM careers WHERE afc_hours = 480 AND id <> 1 ORDER BY id LIMIT 1), 'active')
		     RETURNING id`).split('\n')[0]
	);
	sql(`INSERT INTO memberships (org_id, user_id, role) VALUES (1, ${studentId}, 'student')`);
});

test.afterAll(async () => {
	if (studentId) sql(`DELETE FROM users WHERE id = ${Number(studentId)}`);
	await admin?.dispose();
});

test.use({ ignoreHTTPSErrors: true });

test('al confirmar la carga se muestra un diálogo de éxito con el reporte descargable', async ({ browser }) => {
	const context = await browser.newContext({ ignoreHTTPSErrors: true, storageState: await admin.storageState() });
	const page = await context.newPage();

	const success = await uploadHours(page, 5);
	await expect(success.getByRole('heading', { name: 'Horas cargadas correctamente' })).toBeVisible();
	await expect(success.getByText('Horas agregadas')).toBeVisible();
	await expect(success.getByText('5', { exact: true }).last()).toBeVisible();
	await test.info().attach('dialogo-exito', { body: await page.screenshot(), contentType: 'image/png' });

	const report = await downloadReport(page, success);
	expect(report.filename).toBe(`hrs-agregadas-${mexicoDay()}.csv`);
	expect(report.content).toBe(`\uFEFFnumero_cuenta,correo,horas_agregadas\n${STUDENT_ACCOUNT},${STUDENT_EMAIL},5\n`);

	await success.getByRole('button', { name: 'Listo' }).click();
	await expect(success).toBeHidden();
	expect(sql(`SELECT SUM(hours_delta) FROM hours_ledger WHERE user_id = ${studentId}`)).toBe('5.00');
	await context.close();
});

test('si el alumno alcanza la meta, el reporte trae solo las horas realmente agregadas', async ({ browser }) => {
	// Deja al alumno a 2 horas de su meta de 480.
	sql(`INSERT INTO hours_ledger (user_id, hours_delta, reason, note, category)
	     VALUES (${studentId}, 473, 'adjustment', 'QA saldo previo ${RUN_ID}', 'general')`);
	const context = await browser.newContext({ ignoreHTTPSErrors: true, storageState: await admin.storageState() });
	const page = await context.newPage();

	const success = await uploadHours(page, 10);
	await expect(success.getByText(/alcanzaron la meta AFC/u)).toBeVisible();
	const report = await downloadReport(page, success);
	expect(report.content).toBe(`\uFEFFnumero_cuenta,correo,horas_agregadas\n${STUDENT_ACCOUNT},${STUDENT_EMAIL},2\n`);
	await context.close();
});
