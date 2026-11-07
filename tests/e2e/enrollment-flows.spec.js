import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { apiLogin } from './helpers/session.js';

/*
 * Flujos de inscripción: libre, revisión manual (rechazo/reintento/aprobación), bajas con validación,
 * cupo y consistencia de Métricas/reporte. Prefijo QA-Enroll-; limpia eventos y el alumno temporal.
 */

const env = process.env;
const RUN_ID = Date.now().toString(36);
const DB_CONTAINER = env.AFC_E2E_DB_CONTAINER || 'postgres-afc';
const createdIds = [];
let admin;
let visitor;
let tempStudentId;

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

async function createEvent(label, { mode = 'auto', cancelPolicy = 'free_cancel', capacity = null, resubmission = 'only_changes_requested' } = {}) {
	const start = new Date(Date.now() + 2 * 86_400_000);
	start.setMinutes(0, 0, 0);
	const end = new Date(start.getTime() + 2 * 3_600_000);
	const res = await admin.post('/api/admin/events', {
		data: {
			title: `QA-Enroll-${RUN_ID} ${label}`,
			description: 'Prueba automatizada de inscripciones.',
			category: 'general',
			location: 'Auditorio de Ingeniería',
			organizer: 'Ingeniería en Computación',
			starts_at: start.toISOString(),
			ends_at: end.toISOString(),
			min_attendance_percent: 100,
			afc_hours_enabled: false,
			hours_value: 0,
			capacity_enabled: capacity !== null,
			capacity,
			status: 'published',
			registration_mode: mode,
			resubmission_policy: resubmission,
			geo_enforced: false,
			cancel_policy: cancelPolicy,
			cancel_deadline: null,
			geo: null,
			sessions: [{ starts_at: start.toISOString(), ends_at: end.toISOString(), label: 'Sesión 1', hours_value: null }],
			attributes: { location: 'Auditorio de Ingeniería', organizer: 'Ingeniería en Computación' }
		}
	});
	const body = await res.json();
	expect(res.status(), body.message).toBe(201);
	createdIds.push(Number(body.event.id));
	return Number(body.event.id);
}

async function post(ctx, url, data = {}) {
	const res = await ctx.post(url, { data });
	return { status: res.status(), body: await res.json() };
}

async function review(registrationId, action) {
	const result = await post(admin, `/api/admin/requests/${registrationId}/approve`, { action });
	expect(result.status, result.body.message).toBe(200);
	return result.body;
}

async function stats(eventId) {
	const dashboard = await (await admin.get(`/api/admin/events/${eventId}/dashboard`)).json();
	const report = await (await admin.get(`/api/admin/events/${eventId}/report`)).json();
	return { dashboard: dashboard.registration_stats, rows: report.rows };
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
	test.skip(!dbAvailable(), `Sin acceso al contenedor ${DB_CONTAINER}.`);
	admin = await apiLogin(env.AFC_E2E_ADMIN_EMAIL, env.AFC_E2E_ADMIN_PASSWORD);
	visitor = await apiLogin(env.AFC_E2E_VISITOR_EMAIL, env.AFC_E2E_VISITOR_PASSWORD);
	tempStudentId = Number(
		sql(`INSERT INTO users (email, password_hash, first_name, last_name, student_id, status)
		     VALUES ('qa-enroll-${RUN_ID}@afc.local', 'qa-sin-acceso', 'QA', 'Cupo', '8${String(Date.now()).slice(-8)}', 'active')
		     RETURNING id`).split('\n')[0]
	);
	sql(`INSERT INTO memberships (org_id, user_id, role) VALUES (1, ${tempStudentId}, 'student')`);
});

test.afterAll(async () => {
	for (const id of createdIds) {
		const res = await admin?.delete(`/api/admin/events/${id}`);
		if (res && !res.ok()) await admin.put(`/api/admin/events/${id}`, { data: { status: 'cancelled' } });
	}
	if (tempStudentId) sql(`DELETE FROM users WHERE id = ${Number(tempStudentId)}`);
	await Promise.all([admin, visitor].filter(Boolean).map((ctx) => ctx.dispose()));
});

test('inscripción libre: se aprueba con ticket, baja libre y reinscripción', async () => {
	const eventId = await createEvent('libre');

	const first = await post(visitor, `/api/events/${eventId}/register`);
	expect(first.status, first.body.message).toBe(201);
	expect(first.body.registration.status).toBe('approved');
	const ticket = await (await visitor.get(`/api/events/${eventId}/ticket`)).json();
	expect(ticket.ticket?.ticket_code).toBeTruthy();

	const duplicate = await post(visitor, `/api/events/${eventId}/register`);
	expect(duplicate.status).toBe(409);

	let current = await stats(eventId);
	expect(current.dashboard.registrations_count).toBe(1);
	expect(current.rows).toHaveLength(1);

	const unregister = await post(visitor, `/api/events/${eventId}/unregister`);
	expect(unregister.status, unregister.body.message).toBe(200);
	expect(unregister.body.mode).toBe('cancelled');
	current = await stats(eventId);
	expect(current.dashboard.registrations_count).toBe(0);
	expect(current.rows).toHaveLength(0);

	const again = await post(visitor, `/api/events/${eventId}/register`);
	expect(again.status, again.body.message).toBe(200);
	expect(again.body.reactivated).toBe(true);
	expect(again.body.registration.status).toBe('approved');
});

test('revisión manual: queda pendiente, se rechaza, se vuelve a solicitar y se aprueba', async () => {
	const eventId = await createEvent('revisión manual', { mode: 'manual_review', resubmission: 'allowed' });

	const requestRes = await post(visitor, `/api/events/${eventId}/register`);
	expect(requestRes.status, requestRes.body.message).toBe(201);
	expect(requestRes.body.registration.status).toBe('pending');
	expect(requestRes.body.ticket ?? null).toBeNull();
	const registrationId = requestRes.body.registration.id;

	const pending = await (await admin.get(`/api/admin/requests/pending?event_id=${eventId}`)).json();
	expect(pending.requests.map((item) => Number(item.id ?? item.registration_id))).toContain(Number(registrationId));
	expect((await stats(eventId)).dashboard.pending_count).toBe(1);

	await review(registrationId, 'deny');
	const retry = await post(visitor, `/api/events/${eventId}/register`);
	expect(retry.status, retry.body.message).toBeLessThan(300);
	expect(retry.body.registration.status).toBe('pending');

	await review(retry.body.registration.id, 'approve');
	const ticket = await (await visitor.get(`/api/events/${eventId}/ticket`)).json();
	expect(ticket.ticket?.ticket_code, 'ticket emitido al aprobar').toBeTruthy();
	const current = await stats(eventId);
	expect(current.dashboard.pending_count).toBe(0);
	expect(current.dashboard.registrations_count).toBe(1);
});

test('baja con validación: el organizador puede negarla y después aprobarla', async () => {
	const eventId = await createEvent('baja bloqueada', { cancelPolicy: 'locked' });
	const reg = await post(visitor, `/api/events/${eventId}/register`);
	expect(reg.status, reg.body.message).toBe(201);
	const registrationId = reg.body.registration.id;

	const request1 = await post(visitor, `/api/events/${eventId}/unregister`, { reason: 'Prueba QA' });
	expect(request1.status, request1.body.message).toBe(202);
	expect(request1.body.registration.status).toBe('cancel_pending');
	const repeated = await post(visitor, `/api/events/${eventId}/unregister`);
	expect(repeated.status).toBe(409);

	await review(registrationId, 'deny');
	expect((await stats(eventId)).dashboard.registrations_count).toBe(1);

	const request2 = await post(visitor, `/api/events/${eventId}/unregister`);
	expect(request2.status, request2.body.message).toBe(202);
	await review(registrationId, 'approve');
	const current = await stats(eventId);
	expect(current.dashboard.registrations_count).toBe(0);
	expect(current.rows).toHaveLength(0);
});

test('cupo lleno rechaza la inscripción y se libera al cancelar', async () => {
	const eventId = await createEvent('cupo 1', { capacity: 1 });
	sql(`INSERT INTO registrations (event_id, user_id, status) VALUES (${eventId}, ${tempStudentId}, 'approved'::registration_status)`);

	const full = await post(visitor, `/api/events/${eventId}/register`);
	expect(full.status).toBe(409);
	expect(full.body.message).toContain('cupo');

	sql(`UPDATE registrations SET status = 'cancelled_by_admin'::registration_status WHERE event_id = ${eventId} AND user_id = ${tempStudentId}`);
	const freed = await post(visitor, `/api/events/${eventId}/register`);
	expect(freed.status, freed.body.message).toBe(201);
	const current = await stats(eventId);
	expect(current.dashboard.registrations_count).toBe(1);
	expect(current.rows.map((row) => row.correo)).toEqual([env.AFC_E2E_VISITOR_EMAIL]);
});

test('un alumno no puede revisar solicitudes ni ver métricas de eventos', async () => {
	const eventId = createdIds[0];
	expect((await visitor.get(`/api/admin/events/${eventId}/dashboard`)).status()).toBe(403);
	expect((await visitor.get(`/api/admin/events/${eventId}/report`)).status()).toBe(403);
	expect((await visitor.post('/api/admin/requests/1/approve', { data: { action: 'approve' } })).status()).toBe(403);
});
