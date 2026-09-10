import assert from 'node:assert/strict';
import test from 'node:test';

import {
	buildManualHoursAdjustmentPayload,
	buildAdminUserCreatePayload,
	buildAdminUserEditPayload,
	getAdminCareerScope,
	getAssignableAdminUserRoles,
	isManualHoursEligibleUser,
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

test('only global admins can assign admin and auditor roles', () => {
	assert.deepEqual(getAssignableAdminUserRoles({ role: 'admin', career_id: 1 }), [
		'admin',
		'staff',
		'student',
		'auditor',
		'visitor'
	]);
	assert.deepEqual(getAssignableAdminUserRoles({ role: 'admin', career_id: 7 }), [
		'staff',
		'student',
		'visitor'
	]);
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

test('manual hours are available to any user with an 8-to-10 digit account number', () => {
	assert.equal(isManualHoursEligibleUser({ role: 'visitor', student_id: '123456789' }), true);
	assert.equal(isManualHoursEligibleUser({ role: 'student', student_id: '123456789' }), true);
	assert.equal(isManualHoursEligibleUser({ role: 'staff', student_id: '123456789' }), true);
	assert.equal(isManualHoursEligibleUser({ role: 'student', student_id: '12345678' }), true);
	assert.equal(isManualHoursEligibleUser({ role: 'student', student_id: '1234567890' }), true);
	assert.equal(isManualHoursEligibleUser({ role: 'visitor', student_id: null }), false);
	assert.equal(isManualHoursEligibleUser({ role: 'visitor', student_id: '123' }), false);
});

test('manual hours payload trims auditable fields without converting decimal text', () => {
	assert.deepEqual(
		buildManualHoursAdjustmentPayload({
			hours: ' 2.50 ',
			category: ' culturales ',
			motive: ' Participación extraordinaria ',
			requestId: ' request-id '
		}),
		{
			hours: '2.50',
			category: 'culturales',
			motive: 'Participación extraordinaria',
			requestId: 'request-id'
		}
	);
});
