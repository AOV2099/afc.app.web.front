import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { apiLogin } from './helpers/session.js';

/*
 * Métricas del evento: el botón "Descargar reporte" aparece solo cuando el evento terminó
 * y descarga un CSV con cuenta, correo, carrera, check-in y su fecha/hora.
 * Mueve fechas en la BD local (AFC_E2E_DB_CONTAINER, por defecto postgres-afc); prefijo QA-Report-.
 */

const env = process.env;
const RUN_ID = Date.now().toString(36);
const DB_CONTAINER = env.AFC_E2E_DB_CONTAINER || 'postgres-afc';
const createdIds = [];
let admin;
let visitor;
let staff;
let staffUserId;

const sql = (statement) =>
	execFileSync('docker', ['exec', DB_CONTAINER, 'psql', '-U', 'afc', '-d', 'afc', '-tAc', statement], {
		encoding: 'utf8'
	}).trim();

function dbAvailable() {
	try {
		return sql('SELECT 1') === '1';
	} catch {
		return false;
	}
}

const mexicoDay = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(date);

async function createEvent(label) {
	const start = new Date(Date.now() + 10 * 60_000);
	start.setSeconds(0, 0);
	const end = new Date(start.getTime() + 2 * 3_600_000);
	const res = await admin.post('/api/admin/events', {
		data: {
			title: `QA-Report-${RUN_ID} ${label}`,
			description: 'Prueba automatizada del reporte de asistencia.',
			category: 'general',
			location: 'Auditorio de Ingeniería',
			organizer: 'Ingeniería en Computación',
			starts_at: start.toISOString(),
			ends_at: end.toISOString(),
			min_attendance_percent: 100,
			afc_hours_enabled: false,
			hours_value: 0,
			capacity_enabled: false,
			capacity: null,
			status: 'published',
			registration_mode: 'auto',
			resubmission_policy: 'only_changes_requested',
			geo_enforced: false,
			cancel_policy: 'free_cancel',
			cancel_deadline: null,
			geo: null,
			sessions: [{ starts_at: start.toISOString(), ends_at: end.toISOString(), label: 'Sesión 1', hours_value: null }],
			attributes: { location: 'Auditorio de Ingeniería', organizer: 'Ingeniería en Computación', staff_user_id: staffUserId },
			assign_staff: true,
			staff_user_id: staffUserId
		}
	});
	const body = await res.json();
	expect(res.status(), body.message).toBe(201);
	createdIds.push(Number(body.event.id));
	return Number(body.event.id);
}

async function openMetrics(browser, eventId) {
	const context = await browser.newContext({ ignoreHTTPSErrors: true, storageState: await admin.storageState() });
	const page = await context.newPage();
	await page.goto(`/admin/events/${eventId}/metrics`);
	await expect(page.getByText('Estado general del evento')).toBeVisible();
	return { context, page };
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
	test.skip(!dbAvailable(), `Sin acceso al contenedor ${DB_CONTAINER}.`);
	admin = await apiLogin(env.AFC_E2E_ADMIN_EMAIL, env.AFC_E2E_ADMIN_PASSWORD);
	visitor = await apiLogin(env.AFC_E2E_VISITOR_EMAIL, env.AFC_E2E_VISITOR_PASSWORD);
	staff = await apiLogin(env.AFC_E2E_STAFF_EMAIL, env.AFC_E2E_STAFF_PASSWORD);
	staffUserId = Number((await (await staff.get('/api/me')).json()).user?.id);
});

test.afterAll(async () => {
	for (const id of createdIds) {
		const res = await admin.delete(`/api/admin/events/${id}`);
		if (!res.ok()) await admin.put(`/api/admin/events/${id}`, { data: { status: 'cancelled' } });
	}
	await Promise.all([admin, visitor, staff].filter(Boolean).map((ctx) => ctx.dispose()));
});

test('un evento que no ha terminado muestra métricas sin botón de reporte', async ({ browser }) => {
	const eventId = await createEvent('activo');
	const { context, page } = await openMetrics(browser, eventId);
	await expect(page.getByRole('button', { name: 'Descargar reporte' })).toHaveCount(0);
	await context.close();
});

test('al terminar el evento se descarga el reporte con el check-in del alumno', async ({ browser }) => {
	const eventId = await createEvent('finalizado');
	const reg = await visitor.post(`/api/events/${eventId}/register`, { data: {} });
	expect(reg.ok()).toBeTruthy();
	const ticket = (await (await visitor.get(`/api/events/${eventId}/ticket`)).json()).ticket.ticket_code;
	const scan = await staff.post('/api/admin/events/checkins/scan', { data: { staff_user_id: staffUserId, ticket_code: ticket } });
	expect(scan.ok(), (await scan.json()).message).toBeTruthy();

	// Evento de 15:00 a 17:00 (hora CDMX) de ayer, con el check-in a las 15:06.
	sql(`UPDATE events SET status = 'ended',
	       starts_at = (date_trunc('day', now() AT TIME ZONE 'America/Mexico_City') - interval '1 day' + interval '15 hours') AT TIME ZONE 'America/Mexico_City',
	       ends_at = (date_trunc('day', now() AT TIME ZONE 'America/Mexico_City') - interval '1 day' + interval '17 hours') AT TIME ZONE 'America/Mexico_City'
	     WHERE id = ${eventId};
	     UPDATE event_sessions s SET starts_at = e.starts_at, ends_at = e.ends_at FROM events e WHERE e.id = s.event_id AND s.event_id = ${eventId};
	     UPDATE checkins c SET scanned_at = e.starts_at + interval '6 minutes' FROM events e WHERE e.id = c.event_id AND c.event_id = ${eventId};`);
	const yesterday = mexicoDay(new Date(Date.now() - 86_400_000)).split('-').reverse().join('/');

	const { context, page } = await openMetrics(browser, eventId);
	const visitorRow = sql(`SELECT concat_ws(',', u.student_id, u.email, c.name) FROM users u
	                        LEFT JOIN careers c ON c.id = u.career_id WHERE u.email = '${env.AFC_E2E_VISITOR_EMAIL}'`);
	const [account, email, career] = visitorRow.split(',');

	const table = page.getByTestId('metrics-registrants-table');
	const kpis = page.getByTestId('metrics-kpis');
	await expect(kpis).toContainText(/Inscritos\s*1/u);
	await expect(kpis).toContainText(/Asistieron\s*1/u);
	await expect(kpis).toContainText(/Sin asistencia\s*0/u);
	await expect(kpis).not.toContainText('Pendientes de aprobación');
	await expect(page.getByText('Asistencia').first()).toBeVisible();
	await expect(page.getByText('100%').first()).toBeVisible();
	const row = table.locator('tbody tr').filter({ hasText: email });
	await expect(row).toContainText(account);
	await expect(row).toContainText(career);
	await expect(row).toContainText('Sí');
	await expect(row).toContainText(`${yesterday}, 15:06`);
	await expect(page.getByTestId('metrics-career-breakdown')).toContainText(`${career}`);
	await expect(page.getByTestId('metrics-career-breakdown')).toContainText('1 de 1 · 100%');
	await page.getByLabel('Filtrar por asistencia').selectOption('absent');
	await expect(page.getByText('Ningún inscrito coincide con el filtro.')).toBeVisible();

	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Descargar reporte' }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toBe(`reporte-evento-${eventId}-${mexicoDay()}.csv`);
	const csv = fs.readFileSync(await download.path(), 'utf8');
	expect(csv).toBe(
		'\uFEFFnumero_cuenta,correo,carrera,check_in,fecha_hora_check_in\n' +
			`${visitorRow},Sí,"${yesterday}, 15:06"\n`
	);
	await context.close();
});
