import { devices, expect, test } from '@playwright/test';
import { apiLogin } from './helpers/session.js';

/*
 * Usuarios: en móvil los filtros viven en un diálogo y se guardan en el navegador al recargar.
 */

const env = process.env;
let admin;

test.beforeAll(async () => {
	admin = await apiLogin(env.AFC_E2E_ADMIN_EMAIL, env.AFC_E2E_ADMIN_PASSWORD);
});

test.afterAll(async () => {
	await admin?.dispose();
});

async function openUsers(browser, contextOptions) {
	const context = await browser.newContext({ ...contextOptions, ignoreHTTPSErrors: true, storageState: await admin.storageState() });
	const page = await context.newPage();
	const loaded = page.waitForResponse((res) => res.url().includes('/api/admin/users?') && res.ok());
	await page.goto('/admin/users');
	await loaded;
	return { context, page };
}

test('en móvil los filtros se abren en un diálogo y se conservan al recargar', async ({ browser }) => {
	const { context, page } = await openUsers(browser, devices['iPhone 13']);
	await expect(page.locator('#admin-users-role-filter')).toBeHidden();

	const filtersButton = page.getByRole('button', { name: 'Abrir filtros' });
	await expect(async () => {
		await filtersButton.click();
		await expect(page.getByRole('dialog', { name: 'Filtros' })).toBeVisible({ timeout: 1_000 });
	}).toPass();
	const dialog = page.getByRole('dialog', { name: 'Filtros' });
	const filtered = page.waitForResponse((res) => res.url().includes('role=student') && res.ok());
	await dialog.getByLabel('Rol').selectOption('student');
	await dialog.getByLabel('Estatus').selectOption('active');
	await filtered;
	await dialog.getByRole('button', { name: 'Ver resultados' }).click();
	await expect(dialog).toBeHidden();
	await expect(filtersButton).toContainText('2');

	const reloaded = page.waitForResponse((res) => res.url().includes('/api/admin/users?') && res.url().includes('role=student') && res.ok());
	await page.reload();
	await reloaded;
	await expect(filtersButton).toContainText('2');
	await filtersButton.click();
	await expect(dialog.getByLabel('Rol')).toHaveValue('student');
	await expect(dialog.getByLabel('Estatus')).toHaveValue('active');

	await dialog.getByRole('button', { name: 'Limpiar' }).click();
	await expect(dialog.getByLabel('Rol')).toHaveValue('all');
	await dialog.getByRole('button', { name: 'Ver resultados' }).click();
	await expect(filtersButton).not.toContainText('2');
	await context.close();
});

test('en escritorio los filtros siguen visibles y sin botón de diálogo', async ({ browser }) => {
	const { context, page } = await openUsers(browser, { viewport: { width: 1280, height: 800 } });
	await expect(page.locator('#admin-users-role-filter')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Abrir filtros' })).toBeHidden();
	await context.close();
});
