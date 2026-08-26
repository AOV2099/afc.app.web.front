import assert from 'node:assert/strict';
import test from 'node:test';

import {
	buildAdminUserCreatePayload,
	buildAdminUserEditPayload,
	getAdminCareerScope,
	positiveCareerId
} from '../src/lib/services/adminUserCareerScope.js';

const FORM = {
	email: ' user@example.com ',
	password: 'password-123',
	firstName: ' Ana ',
	lastName: ' Ruiz ',
	studentId: '1234567890',
	careerId: '9',
	status: 'active',
	role: 'student'
};

test('derives global, scoped, and denied admin career states', () => {
	assert.equal(positiveCareerId('4'), 4);
	assert.equal(positiveCareerId('4.2'), null);
	assert.deepEqual(getAdminCareerScope({ role: 'admin', career_id: 1 }), {
		careerId: 1,
		isAdmin: true,
		isGlobalAdmin: true,
		isScopedAdmin: false,
		hasCareerAdminAccess: true
	});
	assert.equal(getAdminCareerScope({ role: 'admin', career_id: 7 }).isScopedAdmin, true);
	assert.equal(getAdminCareerScope({ role: 'admin' }).hasCareerAdminAccess, false);
});

test('scoped create payload always forces the current admin career', () => {
	const payload = buildAdminUserCreatePayload(FORM, {
		isGlobalAdmin: false,
		currentCareerId: 5
	});
	assert.equal(payload.career_id, 5);
	assert.equal(payload.email, 'user@example.com');
});

test('global create payload preserves selected and unassigned career behavior', () => {
	assert.equal(
		buildAdminUserCreatePayload(FORM, { isGlobalAdmin: true, currentCareerId: 1 }).career_id,
		9
	);
	assert.equal(
		buildAdminUserCreatePayload(
			{ ...FORM, careerId: '' },
			{ isGlobalAdmin: true, currentCareerId: 1 }
		).career_id,
		undefined
	);
});

test('scoped edit payload never sends a career change but global edit can', () => {
	const selectedUser = {
		email: 'user@example.com',
		first_name: 'Ana',
		last_name: 'Ruiz',
		student_id: '1234567890',
		career_id: 5,
		status: 'active',
		role: 'student'
	};
	const form = {
		email: 'user@example.com',
		firstName: 'Ana María',
		lastName: 'Ruiz',
		studentId: '1234567890',
		careerId: '9',
		status: 'active',
		role: 'admin'
	};

	assert.deepEqual(
		buildAdminUserEditPayload({ form, selectedUser, isGlobalAdmin: false }),
		{ firstName: 'Ana María', role: 'admin' }
	);
	assert.deepEqual(
		buildAdminUserEditPayload({ form, selectedUser, isGlobalAdmin: true }),
		{ firstName: 'Ana María', career_id: 9, role: 'admin' }
	);
});
