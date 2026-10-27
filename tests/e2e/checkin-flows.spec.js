import { expect, request, test } from '@playwright/test';

/*
 * Check-in del staff con y sin geolocalización.
 * Requiere front + back corriendo y las cuentas de .env.e2e (admin global, visitor y staff sin carrera).
 * Los eventos con asistencia no pueden eliminarse: al final se marcan como cancelados (prefijo QA-Checkin-).
 */

const env = process.env;
const RUN_ID = Date.now().toString(36);
const TIMEZONE = 'America/Mexico_City';
const SCANNER_INPUT = 'Código de ticket (alternativa manual)';
const UNAM_ARAGON = { latitude: 19.476938, longitude: -99.043591 };

const created = { withAttendance: [], deletable: [] };
let admin;
let visitor;
let staff;
let staffUserId;
let otherStaffUserId;

async function apiLogin(email, password) {
	const ctx = await request.newContext({ baseURL: env.AFC_E2E_BASE_URL, ignoreHTTPSErrors: true });
	const res = await ctx.post('/api/login', { data: { email, password } });
	expect(res.ok(), `login ${email}`).toBeTruthy();
	return ctx;
}

function mexicoDay(date) {
	return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(date);
}

function upcomingWindow({ daysAhead = 0 } = {}) {
	const start = new Date(Date.now() + 10 * 60_000 + daysAhead * 86_400_000);
	start.setSeconds(0, 0);
	const end = new Date(start.getTime() + 2 * 3_600_000);
	return { start, end };
}

async function createEvent(label, { staffId = staffUserId, daysAhead = 0, afcHours = true, extraDays = 0, minAttendance = 100 } = {}) {
	const { start, end } = upcomingWindow({ daysAhead });
	const title = `QA-Checkin-${RUN_ID} ${label}`;
	// Los eventos de varias sesiones solo admiten actividades AFC multisesión (p. ej. seminarios).
	const afcValuation =
		extraDays > 0
			? { origin: 'fes_aragon', type_key: 'seminars', scenario_key: 'seminar_constant' }
			: { origin: 'fes_aragon', type_key: 'conferences', scenario_key: 'conf_career_division' };
	const hoursFields = afcHours ? { afc_valuation: afcValuation } : { afc_hours_enabled: false, hours_value: 0 };
	// Una sesión por día, con el mismo horario, a partir de hoy.
	const sessions = Array.from({ length: extraDays + 1 }, (_, index) => ({
		starts_at: new Date(start.getTime() + index * 86_400_000).toISOString(),
		ends_at: new Date(end.getTime() + index * 86_400_000).toISOString(),
		label: `Sesión ${index + 1}`,
		hours_value: null
	}));
	const res = await admin.post('/api/admin/events', {
		data: {
			title,
			description: 'Prueba automatizada de check-in.',
			category: 'general',
			location: 'Auditorio de Ingeniería',
			organizer: 'Ingeniería en Computación',
			starts_at: sessions[0].starts_at,
			ends_at: sessions[sessions.length - 1].ends_at,
			min_attendance_percent: minAttendance,
			...hoursFields,
			capacity_enabled: false,
			capacity: null,
			status: 'published',
			registration_mode: 'auto',
			resubmission_policy: 'only_changes_requested',
			geo_enforced: false,
			cancel_policy: 'free_cancel',
			cancel_deadline: null,
			geo: null,
			sessions,
			attributes: { location: 'Auditorio de Ingeniería', organizer: 'Ingeniería en Computación', staff_user_id: staffId },
			assign_staff: true,
			staff_user_id: staffId
		}
	});
	const body = await res.json();
	expect(res.status(), body.message).toBe(201);
	return { id: body.event.id, title };
}

async function registerAndGetTicket(eventId) {
	const reg = await visitor.post(`/api/events/${eventId}/register`, { data: {} });
	expect(reg.ok(), (await reg.json()).message).toBeTruthy();
	const ticketRes = await visitor.get(`/api/events/${eventId}/ticket`);
	const body = await ticketRes.json();
	expect(body.ticket?.ticket_code, 'ticket emitido').toBeTruthy();
	return body.ticket.ticket_code;
}

async function hoursProgress() {
	const body = await (await visitor.get('/api/me/hours/history?pageSize=100')).json();
	return body;
}

async function openScanner(browser, contextOptions = {}, initScript = null) {
	const context = await browser.newContext({
		ignoreHTTPSErrors: true,
		storageState: await staff.storageState(),
		...contextOptions
	});
	if (initScript) await context.addInitScript(initScript);
	const page = await context.newPage();
	await page.goto('/staff/scanner');
	await expect(page.getByText(`Staff #${staffUserId}`)).toBeVisible();
	return { context, page };
}

async function scanFromUi(page, ticketCode) {
	await page.getByRole('textbox', { name: SCANNER_INPUT }).fill(ticketCode);
	const requestPromise = page.waitForRequest('**/api/admin/events/checkins/scan');
	const responsePromise = page.waitForResponse('**/api/admin/events/checkins/scan');
	await page.getByRole('button', { name: 'Registrar check-in' }).click();
	const [scanRequest, scanResponse] = await Promise.all([requestPromise, responsePromise]);
	return { sent: scanRequest.postDataJSON(), status: scanResponse.status(), body: await scanResponse.json() };
}

async function expectCreditedHours(event, before) {
	const after = await hoursProgress();
	const entry = after.history.find((item) => item.event?.id === event.id && item.reason === 'checkin');
	expect(entry, 'movimiento de horas del check-in').toBeTruthy();
	const remaining = Math.max(0, Number(before.hours_goal) - Number(before.total_hours));
	expect(entry.hours_delta).toBe(Math.min(22, remaining));
	expect(Number(after.total_hours)).toBeCloseTo(Number(before.total_hours) + entry.hours_delta, 2);
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
	const { start } = upcomingWindow();
	test.skip(mexicoDay(start) !== mexicoDay(new Date()), 'La sesión de prueba cruzaría la medianoche.');

	admin = await apiLogin(env.AFC_E2E_ADMIN_EMAIL, env.AFC_E2E_ADMIN_PASSWORD);
	visitor = await apiLogin(env.AFC_E2E_VISITOR_EMAIL, env.AFC_E2E_VISITOR_PASSWORD);
	staff = await apiLogin(env.AFC_E2E_STAFF_EMAIL, env.AFC_E2E_STAFF_PASSWORD);

	const me = await (await staff.get('/api/me')).json();
	staffUserId = Number(me.user?.id ?? me.user?.user_id ?? me.id);
	expect(staffUserId).toBeGreaterThan(0);

	const staffList = await (await admin.get('/api/admin/staff-users')).json();
	otherStaffUserId = Number(staffList.staff_users?.find((s) => Number(s.id) !== staffUserId)?.id);
});

test.afterAll(async () => {
	if (!admin) return;
	for (const id of created.deletable) await admin.delete(`/api/admin/events/${id}`);
	for (const id of created.withAttendance) await admin.put(`/api/admin/events/${id}`, { data: { status: 'cancelled' } });
	await Promise.all([admin, visitor, staff].filter(Boolean).map((ctx) => ctx.dispose()));
});

test('dispositivo sin permiso de ubicación registra el check-in', async ({ browser }) => {
	const event = await createEvent('sin ubicación');
	created.withAttendance.push(event.id);
	const ticketCode = await registerAndGetTicket(event.id);
	const before = await hoursProgress();

	const { context, page } = await openScanner(browser);
	const scan = await scanFromUi(page, ticketCode);
	expect(scan.status, scan.body.message).toBe(200);
	expect(scan.body.result).toBe('accepted');
	await expect(page.getByText('Check-in aceptado.').first()).toBeVisible();
	await expectCreditedHours(event, before);

	const duplicate = await scanFromUi(page, ticketCode);
	expect(duplicate.status).toBe(409);
	await expect(page.getByText('El usuario ya tiene check-in para esta sesión.').first()).toBeVisible();
	await context.close();
});

test('dispositivo con ubicación activa y precisión decimal registra el check-in', async ({ browser }) => {
	const event = await createEvent('ubicación activa');
	created.withAttendance.push(event.id);
	const ticketCode = await registerAndGetTicket(event.id);
	const before = await hoursProgress();

	const { context, page } = await openScanner(browser, {
		permissions: ['geolocation'],
		geolocation: { ...UNAM_ARAGON, accuracy: 12.38 }
	});
	const scan = await scanFromUi(page, ticketCode);
	expect(scan.sent.client_lat).toBeCloseTo(UNAM_ARAGON.latitude, 5);
	expect(scan.sent.client_lng).toBeCloseTo(UNAM_ARAGON.longitude, 5);
	expect(scan.sent.accuracy_m).toBe(12);
	expect(scan.status, scan.body.message).toBe(200);
	expect(scan.body.result).toBe('accepted');
	await expect(page.getByText('Check-in aceptado.').first()).toBeVisible();
	await expectCreditedHours(event, before);
	await context.close();
});

test('si el GPS nunca responde, el escáner no se bloquea', async ({ browser }) => {
	const event = await createEvent('GPS sin respuesta');
	created.withAttendance.push(event.id);
	const ticketCode = await registerAndGetTicket(event.id);

	const { context, page } = await openScanner(browser, {}, () => {
		Object.defineProperty(navigator, 'geolocation', {
			configurable: true,
			value: { getCurrentPosition() {}, watchPosition: () => 0, clearWatch() {} }
		});
	});
	const startedAt = Date.now();
	const scan = await scanFromUi(page, ticketCode);
	expect(Date.now() - startedAt).toBeLessThan(6_000);
	expect(scan.sent.client_lat).toBeUndefined();
	expect(scan.status, scan.body.message).toBe(200);
	expect(scan.body.result).toBe('accepted');
	await context.close();
});

test('precisión decimal enviada directo al backend (falla del evento piloto)', async () => {
	const event = await createEvent('precisión decimal API');
	created.withAttendance.push(event.id);
	const ticketCode = await registerAndGetTicket(event.id);

	const res = await staff.post('/api/admin/events/checkins/scan', {
		data: {
			staff_user_id: staffUserId,
			ticket_code: ticketCode,
			client_lat: UNAM_ARAGON.latitude,
			client_lng: UNAM_ARAGON.longitude,
			accuracy_m: 12.38
		}
	});
	const body = await res.json();
	expect(res.status(), body.message).toBe(200);
	expect(body.result).toBe('accepted');
});

test('coordenadas inválidas enviadas por un dispositivo no rompen el check-in', async () => {
	const event = await createEvent('coordenadas inválidas');
	created.withAttendance.push(event.id);
	const ticketCode = await registerAndGetTicket(event.id);

	const res = await staff.post('/api/admin/events/checkins/scan', {
		data: { staff_user_id: staffUserId, ticket_code: ticketCode, client_lat: 500, client_lng: 'abc', accuracy_m: 1e12 }
	});
	const body = await res.json();
	expect(res.status(), body.message).toBe(200);
	expect(body.result).toBe('accepted');
});

test('ticket inexistente se rechaza con mensaje claro', async ({ browser }) => {
	const { context, page } = await openScanner(browser);
	const scan = await scanFromUi(page, `codigo-falso-${RUN_ID}`);
	expect(scan.status).toBe(400);
	expect(scan.body.result).toBe('invalid_ticket');
	await expect(page.getByText('Ticket inválido.').first()).toBeVisible();
	await context.close();
});

test('ticket cancelado por el alumno no acredita horas', async ({ browser }) => {
	const event = await createEvent('ticket cancelado');
	created.deletable.push(event.id);
	const ticketCode = await registerAndGetTicket(event.id);
	const cancel = await visitor.post(`/api/events/${event.id}/unregister`, { data: {} });
	expect(cancel.ok(), (await cancel.json()).message).toBeTruthy();

	const { context, page } = await openScanner(browser);
	const scan = await scanFromUi(page, ticketCode);
	expect(scan.status).toBe(409);
	expect(scan.body.result).toBe('cancelled_ticket');
	await expect(page.getByText('El ticket no está activo.').first()).toBeVisible();
	await context.close();
});

test('staff no asignado al evento no puede registrar asistencia', async ({ browser }) => {
	test.skip(!otherStaffUserId, 'Se necesita un segundo usuario staff.');
	const event = await createEvent('otro staff', { staffId: otherStaffUserId });
	created.deletable.push(event.id);
	const ticketCode = await registerAndGetTicket(event.id);

	const { context, page } = await openScanner(browser);
	const scan = await scanFromUi(page, ticketCode);
	expect(scan.status).toBe(403);
	await expect(page.getByText('El usuario staff no está asignado a este evento.').first()).toBeVisible();
	await context.close();
});

test('evento de otro día se rechaza antes de su fecha', async ({ browser }) => {
	const event = await createEvent('mañana', { daysAhead: 1 });
	created.deletable.push(event.id);
	const ticketCode = await registerAndGetTicket(event.id);

	const { context, page } = await openScanner(browser);
	const scan = await scanFromUi(page, ticketCode);
	expect(scan.status).toBe(409);
	expect(scan.body.code).toBe('SESSION_NOT_ACTIVE');
	await context.close();
});

test('un alumno no puede usar el endpoint de escaneo', async () => {
	const res = await visitor.post('/api/admin/events/checkins/scan', {
		data: { staff_user_id: staffUserId, ticket_code: 'cualquiera' }
	});
	expect(res.status()).toBe(403);
});

test('evento sin horas AFC registra la asistencia con 0 hrs', async ({ browser }) => {
	const event = await createEvent('sin horas AFC', { afcHours: false });
	created.withAttendance.push(event.id);
	const detail = await (await admin.get(`/api/admin/events/${event.id}`)).json();
	expect(Number(detail.event?.hours_value)).toBe(0);
	expect(detail.event?.afc_valuation ?? null).toBeNull();

	const ticketCode = await registerAndGetTicket(event.id);
	const before = await hoursProgress();

	const { context, page } = await openScanner(browser);
	const scan = await scanFromUi(page, ticketCode);
	expect(scan.status, scan.body.message).toBe(200);
	expect(scan.body.result).toBe('accepted');
	await expect(page.getByText('Check-in aceptado.').first()).toBeVisible();
	const duplicate = await scanFromUi(page, ticketCode);
	expect(duplicate.status).toBe(409);
	await context.close();

	const after = await hoursProgress();
	const entry = after.history.find((item) => item.event?.id === event.id && item.reason === 'checkin');
	expect(entry, 'movimiento de asistencia').toBeTruthy();
	expect(entry.hours_delta).toBe(0);
	expect(entry.note || '').not.toMatch(/Se han agregado/u);
	expect(Number(after.total_hours)).toBeCloseTo(Number(before.total_hours), 2);

	const unregister = await visitor.post(`/api/events/${event.id}/unregister`, { data: {} });
	expect(unregister.status(), 'no puede darse de baja tras asistir').toBe(409);

	const historyContext = await browser.newContext({ ignoreHTTPSErrors: true, storageState: await visitor.storageState() });
	const historyTab = await historyContext.newPage();
	await historyTab.goto('/app/history');
	await expect(historyTab.getByText(event.title).first()).toBeVisible();
	await historyContext.close();
});

async function scanByApi(ticketCode) {
	const res = await staff.post('/api/admin/events/checkins/scan', {
		data: { staff_user_id: staffUserId, ticket_code: ticketCode }
	});
	return { status: res.status(), body: await res.json() };
}

test('evento de 2 sesiones con mínimo 50 %: la primera asistencia acredita las horas', async () => {
	const event = await createEvent('2 sesiones 50%', { extraDays: 1, minAttendance: 50 });
	created.withAttendance.push(event.id);
	const detail = await (await admin.get(`/api/admin/events/${event.id}`)).json();
	expect(detail.sessions).toHaveLength(2);
	expect(detail.event.min_attendance_percent).toBe(50);

	const ticketCode = await registerAndGetTicket(event.id);
	const before = await hoursProgress();
	const scan = await scanByApi(ticketCode);
	expect(scan.status, scan.body.message).toBe(200);
	expect(scan.body.attendance).toMatchObject({ attended: 1, total: 2, required: 1, met: true });
	expect(scan.body.hours_credited).toBeGreaterThanOrEqual(0);
	const after = await hoursProgress();
	const entries = after.history.filter((item) => item.event?.id === event.id && item.reason === 'checkin');
	expect(entries).toHaveLength(1);
	expect(entries[0].hours_delta).toBe(scan.body.hours_credited);
	expect(Number(after.total_hours)).toBeCloseTo(Number(before.total_hours) + scan.body.hours_credited, 2);

	const unregister = await visitor.post(`/api/events/${event.id}/unregister`, { data: {} });
	expect(unregister.status()).toBe(409);
});

test('evento de 2 sesiones con mínimo 100 %: una asistencia no acredita horas todavía', async () => {
	const event = await createEvent('2 sesiones 100%', { extraDays: 1, minAttendance: 100 });
	created.withAttendance.push(event.id);
	const ticketCode = await registerAndGetTicket(event.id);
	const before = await hoursProgress();

	const scan = await scanByApi(ticketCode);
	expect(scan.status, scan.body.message).toBe(200);
	expect(scan.body.attendance).toMatchObject({ attended: 1, total: 2, required: 2, met: false });
	expect(scan.body.hours_credited).toBeNull();

	const after = await hoursProgress();
	expect(after.history.some((item) => item.event?.id === event.id)).toBe(false);
	expect(Number(after.total_hours)).toBeCloseTo(Number(before.total_hours), 2);

	const ticket = await (await visitor.get(`/api/events/${event.id}/ticket`)).json();
	expect(ticket.attendance).toMatchObject({ attended: 1, total: 2, required: 2, pending: 1, reachable: true });

	const duplicate = await scanByApi(ticketCode);
	expect(duplicate.status).toBe(409);
	const unregister = await visitor.post(`/api/events/${event.id}/unregister`, { data: {} });
	expect(unregister.status(), 'ya asistió a una sesión').toBe(409);
});

test('con asistencias se reprograman las sesiones pendientes y el alumno ve su avance en Mi calendario', async ({ browser }) => {
	const event = await createEvent('3 sesiones reprogramables', { extraDays: 2, minAttendance: 100 });
	created.withAttendance.push(event.id);
	const ticketCode = await registerAndGetTicket(event.id);

	const scans = await Promise.all([scanByApi(ticketCode), scanByApi(ticketCode)]);
	expect(scans.map((scan) => scan.status).sort(), 'dos escaneos simultáneos: uno pasa y otro es duplicado').toEqual([200, 409]);

	const detail = await (await admin.get(`/api/admin/events/${event.id}`)).json();
	expect(detail.sessions.map((session) => session.has_checkins)).toEqual([true, false, false]);
	const [first, second, third] = detail.sessions;
	const shift = (session, days) => ({
		starts_at: new Date(new Date(session.starts_at).getTime() + days * 86_400_000).toISOString(),
		ends_at: new Date(new Date(session.ends_at).getTime() + days * 86_400_000).toISOString(),
		label: session.label
	});

	const moved = await admin.put(`/api/admin/events/${event.id}`, {
		data: { sessions: [shift(first, 0), shift(second, 0), shift(third, 2)] }
	});
	const movedBody = await moved.json();
	expect(moved.status(), movedBody.message).toBe(200);
	expect(new Date(movedBody.event.ends_at).toISOString()).toBe(shift(third, 2).ends_at);

	const movedAttended = await admin.put(`/api/admin/events/${event.id}`, {
		data: { sessions: [shift(first, 1), shift(second, 2), shift(third, 2)] }
	});
	expect(movedAttended.status()).toBe(409);
	expect((await movedAttended.json()).message).toMatch(/ya tiene asistencias/u);
	const fewer = await admin.put(`/api/admin/events/${event.id}`, {
		data: { sessions: [shift(first, 0), shift(second, 0)] }
	});
	expect(fewer.status()).toBe(409);
	expect((await fewer.json()).message).toMatch(/conservar sus 3 sesiones/u);

	const ticket = await (await visitor.get(`/api/events/${event.id}/ticket`)).json();
	expect(ticket.sessions.map((session) => session.state)).toEqual(['attended', 'upcoming', 'upcoming']);
	const calendar = await (await visitor.get('/api/me/calendar')).json();
	const entry = calendar.events.find((item) => item.id === event.id);
	expect(entry.attendance).toMatchObject({ attended: 1, total: 3, required: 3, met: false, reachable: true });
	expect(entry.sessions).toHaveLength(3);

	const context = await browser.newContext({ ignoreHTTPSErrors: true, storageState: await visitor.storageState() });
	const page = await context.newPage();
	await page.goto('/app/calendar');
	await expect(page.getByRole('heading', { name: 'Mi calendario' })).toBeVisible();
	const dayCell = page.locator(`[data-date="${mexicoDay(new Date(first.starts_at))}"]`);
	await expect(dayCell).toHaveAttribute('aria-label', /sesión/u);
	await dayCell.click();
	const dayDialog = page.getByTestId('calendar-day-dialog');
	const session = dayDialog.getByTestId('calendar-session').filter({ hasText: event.title });
	await expect(session).toContainText('Asistida');
	await expect(session.getByTestId('attendance-progress')).toContainText('Asistencia: 1 de 3');
	await expect(session.getByTestId('hours-release')).toHaveCount(0);
	await session.getByText(event.title).click();
	const sheetProgress = page.getByTestId('sheet-attendance');
	await expect(sheetProgress.getByText('Asistencia: 1 de 3 sesiones')).toBeVisible();
	await expect(sheetProgress.getByTestId('hours-release')).toContainText('al asistir a 3 de 3 sesiones (100 %)');
	await expect(dayDialog).toBeHidden();
	const sheet = page.getByRole('dialog');
	await expect(sheet.getByRole('button', { name: /Darme de baja/u })).toHaveCount(0);
	await sheet.getByRole('button', { name: /Ver ticket/u }).click();
	const ticketDialog = page.getByTestId('ticket-dialog');
	await expect(ticketDialog.getByRole('img', { name: /QR ticket/u })).toBeVisible();
	await expect(ticketDialog.getByTestId('attendance-progress')).toHaveCount(0);
	await context.close();
});
