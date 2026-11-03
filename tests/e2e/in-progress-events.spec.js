import { execFileSync } from 'node:child_process';
import { expect, request, test } from '@playwright/test';

/*
 * Inscripción libre: abierta hasta que el evento termina; con revisión manual cierra al iniciar.
 * Los eventos siguen visibles (deshabilitados al terminar) hasta que acaba su día.
 * Requiere front + back corriendo y el contenedor de Postgres local (AFC_E2E_DB_CONTAINER, por defecto postgres-afc)
 * para mover las fechas al pasado, porque la API no permite crear eventos con inicio pasado.
 */

const env = process.env;
const RUN_ID = Date.now().toString(36);
const DB_CONTAINER = env.AFC_E2E_DB_CONTAINER || 'postgres-afc';
const MINUTE = 60_000;

const createdIds = [];
let admin;
let visitor;

async function apiLogin(email, password) {
	const ctx = await request.newContext({ baseURL: env.AFC_E2E_BASE_URL, ignoreHTTPSErrors: true });
	const res = await ctx.post('/api/login', { data: { email, password } });
	expect(res.ok(), `login ${email}`).toBeTruthy();
	return ctx;
}

function sql(statement) {
	return execFileSync('docker', ['exec', DB_CONTAINER, 'psql', '-U', 'afc', '-d', 'afc', '-tAc', statement], {
		encoding: 'utf8'
	});
}

function dbAvailable() {
	try {
		return sql('SELECT 1').trim() === '1';
	} catch {
		return false;
	}
}

function mexicoDay(date) {
	return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(date);
}

async function createEvent(label, { registrationMode = 'auto' } = {}) {
	const start = new Date(Date.now() + 10 * MINUTE);
	start.setSeconds(0, 0);
	const end = new Date(start.getTime() + 2 * 60 * MINUTE);
	const title = `QA-InProgress-${RUN_ID} ${label}`;
	const res = await admin.post('/api/admin/events', {
		data: {
			title,
			description: 'Prueba automatizada de eventos en curso.',
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
			registration_mode: registrationMode,
			resubmission_policy: 'only_changes_requested',
			geo_enforced: false,
			cancel_policy: 'free_cancel',
			cancel_deadline: null,
			geo: null,
			sessions: [{ starts_at: start.toISOString(), ends_at: end.toISOString(), label: 'Sesión 1', hours_value: null }],
			attributes: { location: 'Auditorio de Ingeniería', organizer: 'Ingeniería en Computación' }
		}
	});
	const body = await res.json();
	expect(res.status(), body.message).toBe(201);
	createdIds.push(Number(body.event.id));
	return { id: Number(body.event.id), title, start, end };
}

/** Recorre el evento y su sesión para que el inicio quede `startedMinutesAgo` minutos atrás. */
function shiftEventIntoPast(eventId, { startedMinutesAgo, durationMinutes }) {
	const id = Number(eventId);
	sql(`UPDATE events
	       SET starts_at = now() - interval '${startedMinutesAgo} minutes',
	           ends_at = now() - interval '${startedMinutesAgo} minutes' + interval '${durationMinutes} minutes'
	     WHERE id = ${id};
	     UPDATE event_sessions
	       SET starts_at = now() - interval '${startedMinutesAgo} minutes',
	           ends_at = now() - interval '${startedMinutesAgo} minutes' + interval '${durationMinutes} minutes'
	     WHERE event_id = ${id};`);
}

/** Abre Explorar como el alumno, opcionalmente con el reloj o la zona horaria del dispositivo alterados. */
async function openExplore(browser, { clockAt = null, timezoneId } = {}) {
	const context = await browser.newContext({
		ignoreHTTPSErrors: true,
		storageState: await visitor.storageState(),
		...(timezoneId ? { timezoneId } : {})
	});
	const page = await context.newPage();
	if (clockAt) await page.clock.install({ time: clockAt });
	await page.goto('/app/explore');
	await expect(page.getByRole('heading', { name: 'Explorar' })).toBeVisible();
	return { context, page };
}

async function searchFor(page, title) {
	const responsePromise = page.waitForResponse((res) => res.url().includes('/api/events?') && res.request().method() === 'GET');
	await page.getByPlaceholder('Buscar por nombre o categoría...').fill(title);
	await page.getByPlaceholder('Buscar por nombre o categoría...').press('Enter');
	await responsePromise;
	await expect(page.getByText('Cargando eventos...')).toHaveCount(0);
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
	admin = await apiLogin(env.AFC_E2E_ADMIN_EMAIL, env.AFC_E2E_ADMIN_PASSWORD);
	visitor = await apiLogin(env.AFC_E2E_VISITOR_EMAIL, env.AFC_E2E_VISITOR_PASSWORD);
});

test.afterAll(async () => {
	if (!admin) return;
	for (const id of createdIds) {
		const res = await admin.delete(`/api/admin/events/${id}`);
		if (!res.ok()) await admin.put(`/api/admin/events/${id}`, { data: { status: 'cancelled' } });
	}
	await Promise.all([admin, visitor].filter(Boolean).map((ctx) => ctx.dispose()));
});

test('con inscripción libre, un evento ya iniciado sigue visible y el alumno puede inscribirse', async ({ browser }) => {
	test.skip(!dbAvailable(), `Sin acceso al contenedor ${DB_CONTAINER}.`);
	const event = await createEvent('en curso');
	shiftEventIntoPast(event.id, { startedMinutesAgo: 30, durationMinutes: 120 });

	const api = await (await visitor.get(`/api/events?q=${encodeURIComponent(event.title)}`)).json();
	expect(api.events.map((e) => Number(e.id)), 'la API sí devuelve el evento en curso').toContain(event.id);

	const { context, page } = await openExplore(browser);
	await searchFor(page, event.title);
	await expect(page.getByText(event.title), 'el evento en curso debe seguir en Explorar').toBeVisible();

	await page.getByText(event.title).click();
	const registerResponse = page.waitForResponse((res) => res.url().includes(`/api/events/${event.id}/register`));
	await page.getByRole('button', { name: 'Inscribirme ahora' }).click();
	expect((await registerResponse).ok(), 'el servidor acepta la inscripción a un evento en curso').toBeTruthy();
	await context.close();
});

test('con revisión manual, un evento ya iniciado se ve pero las inscripciones están cerradas', async ({ browser }) => {
	test.skip(!dbAvailable(), `Sin acceso al contenedor ${DB_CONTAINER}.`);
	const event = await createEvent('revisión manual en curso', { registrationMode: 'manual_review' });
	shiftEventIntoPast(event.id, { startedMinutesAgo: 30, durationMinutes: 120 });

	const { context, page } = await openExplore(browser);
	await searchFor(page, event.title);
	await page.getByText(event.title).click();
	await expect(page.getByRole('button', { name: 'Inscripciones cerradas' })).toBeDisabled();
	await expect(page.getByRole('button', { name: 'Inscribirme ahora' })).toHaveCount(0);
	await context.close();

	const res = await visitor.post(`/api/events/${event.id}/register`, { data: {} });
	expect(res.status()).toBe(400);
	expect((await res.json()).message).toContain('cerraron al iniciar');
});

test('si el reloj del dispositivo va adelantado (evento ya iniciado para el alumno), el evento no desaparece', async ({ browser }) => {
	const event = await createEvent('reloj adelantado');
	const { context, page } = await openExplore(browser, { clockAt: event.start.getTime() + 20 * MINUTE });
	await searchFor(page, event.title);
	await expect(page.getByText(event.title)).toBeVisible();
	await context.close();
});

for (const timezoneId of ['America/Mexico_City', 'America/Los_Angeles', 'Asia/Tokyo', 'UTC']) {
	test(`la zona horaria del dispositivo (${timezoneId}) no cambia qué eventos se ven`, async ({ browser }) => {
		const event = await createEvent(`zona ${timezoneId}`);
		for (const clockAt of [null, event.start.getTime() + 20 * MINUTE]) {
			const { context, page } = await openExplore(browser, { timezoneId, clockAt });
			await searchFor(page, event.title);
			await expect(page.getByText(event.title), `visible con reloj ${clockAt ? 'en curso' : 'actual'}`).toBeVisible();
			await context.close();
		}
	});
}

test('un evento que terminó hoy sigue visible pero deshabilitado y el servidor rechaza la inscripción', async ({ browser }) => {
	test.skip(!dbAvailable(), `Sin acceso al contenedor ${DB_CONTAINER}.`);
	test.skip(mexicoDay(new Date(Date.now() - 5 * MINUTE)) !== mexicoDay(new Date()), 'Justo después de medianoche.');
	const event = await createEvent('terminado hoy');
	shiftEventIntoPast(event.id, { startedMinutesAgo: 3, durationMinutes: 1 });

	const { context, page } = await openExplore(browser);
	await searchFor(page, event.title);
	const card = page.getByTestId('event-card').filter({ hasText: event.title });
	await expect(card, 'visible hasta que termina el día').toBeVisible();
	await expect(card).toHaveAttribute('data-past', 'true');
	await expect(card).toHaveAttribute('aria-disabled', 'true');
	await expect(card.getByText('Finalizado')).toBeVisible();
	await card.click({ force: true });
	await expect(page.getByRole('button', { name: 'Inscribirme ahora' }), 'la tarjeta no abre la inscripción').toHaveCount(0);
	await context.close();

	const res = await visitor.post(`/api/events/${event.id}/register`, { data: {} });
	expect(res.status()).toBe(400);
	expect((await res.json()).message).toContain('ya no acepta registros');
});

test('un evento que terminó un día anterior ya no aparece', async ({ browser }) => {
	test.skip(!dbAvailable(), `Sin acceso al contenedor ${DB_CONTAINER}.`);
	const event = await createEvent('terminado ayer');
	shiftEventIntoPast(event.id, { startedMinutesAgo: 26 * 60, durationMinutes: 60 });

	const { context, page } = await openExplore(browser);
	await searchFor(page, event.title);
	await expect(page.getByText(event.title)).toHaveCount(0);
	await context.close();
});
