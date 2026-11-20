import { expect, test } from '@playwright/test';
import { apiLogin } from './helpers/session.js';

/*
 * Usuarios: el administrador global descarga la constancia de horas AFC de un alumno.
 */

const env = process.env;
let admin;

test.beforeAll(async () => {
	admin = await apiLogin(env.AFC_E2E_ADMIN_EMAIL, env.AFC_E2E_ADMIN_PASSWORD);
});

test.afterAll(async () => {
	await admin?.dispose();
});

test('el administrador global visualiza la constancia y la descarga desde la vista previa', async ({ browser }) => {
	const visitorList = await (await admin.get(`/api/admin/users?q=${encodeURIComponent(env.AFC_E2E_VISITOR_EMAIL)}`)).json();
	const visitor = (visitorList.users || visitorList.items || [])[0];
	expect(visitor?.student_id, 'el alumno de prueba debe tener número de cuenta').toBeTruthy();

	const context = await browser.newContext({
		ignoreHTTPSErrors: true,
		acceptDownloads: true,
		viewport: { width: 1280, height: 800 },
		storageState: await admin.storageState()
	});
	const page = await context.newPage();
	await page.goto('/admin/users');
	const searched = page.waitForResponse((res) => res.url().includes(`q=${visitor.student_id}`) && res.ok());
	await page.getByPlaceholder('Buscar por nombre, correo, matrícula o carrera...').fill(visitor.student_id);
	await searched;

	const row = page.getByRole('row').filter({ hasText: visitor.student_id });
	await row.getByRole('button', { name: 'Visualizar constancia' }).click();
	const preview = page.getByTestId('constancia-preview');
	await expect(preview).toBeVisible();
	await expect(preview.locator('iframe[title="Vista previa de la constancia"]')).toHaveAttribute('src', /^blob:/);

	const download = page.waitForEvent('download');
	await preview.getByRole('button', { name: 'Descargar PDF' }).click();
	const file = await download;
	expect(file.suggestedFilename()).toBe(`constancia-afc-${visitor.student_id}.pdf`);
	const stream = await file.createReadStream();
	const chunks = [];
	for await (const chunk of stream) chunks.push(chunk);
	expect(Buffer.concat(chunks).subarray(0, 5).toString()).toBe('%PDF-');
	await context.close();
});

test('un alumno no puede descargar constancias', async () => {
	const visitorList = await (await admin.get(`/api/admin/users?q=${encodeURIComponent(env.AFC_E2E_VISITOR_EMAIL)}`)).json();
	const visitor = (visitorList.users || visitorList.items || [])[0];
	const student = await apiLogin(env.AFC_E2E_VISITOR_EMAIL, env.AFC_E2E_VISITOR_PASSWORD);
	expect((await student.get(`/api/admin/users/${visitor.id}/constancia`)).status()).toBe(403);
	await student.dispose();
});

test('sin completar las horas no hay botón ni constancia', async () => {
	const list = await (await admin.get('/api/admin/users?role=student&pageSize=100')).json();
	const pending = (list.users || []).find(
		(u) => /^\d{8,10}$/.test(String(u.student_id || '')) && Number(u.hours_goal) > 0 && Number(u.hours_total) < Number(u.hours_goal)
	);
	test.skip(!pending, 'No hay alumnos sin completar sus horas en la base local.');

	const res = await admin.get(`/api/admin/users/${pending.id}/constancia`);
	expect(res.status()).toBe(422);
	expect((await res.json()).message).toContain('aún no completa');
});
