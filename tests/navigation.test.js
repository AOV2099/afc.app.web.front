import assert from 'node:assert/strict';
import test from 'node:test';

import {
	isNavigationPathActive,
	isNavigationPathExact
} from '../src/lib/utils/navigation.js';

test('matches exact navigation paths', () => {
	assert.equal(isNavigationPathExact('/app/home', '/app/home'), true);
	assert.equal(isNavigationPathExact('/admin/events', '/admin/events'), true);
	assert.equal(isNavigationPathActive('/app/home', '/app/home'), true);
	assert.equal(isNavigationPathActive('/admin/events', '/admin/events'), true);
});

test('nested navigation paths are active but not exact', () => {
	assert.equal(isNavigationPathExact('/app/history/42', '/app/history'), false);
	assert.equal(isNavigationPathExact('/admin/users/17/edit', '/admin/users'), false);
	assert.equal(isNavigationPathActive('/app/history/42', '/app/history'), true);
	assert.equal(isNavigationPathActive('/admin/users/17/edit', '/admin/users'), true);
});

test('normalizes trailing slashes', () => {
	assert.equal(isNavigationPathExact('/app/account/', '/app/account'), true);
	assert.equal(isNavigationPathExact('/admin/settings', '/admin/settings///'), true);
	assert.equal(isNavigationPathActive('/app/account/', '/app/account'), true);
	assert.equal(isNavigationPathActive('/admin/settings', '/admin/settings///'), true);
	assert.equal(isNavigationPathExact('/admin/events/42/', '/admin/events/'), false);
	assert.equal(isNavigationPathActive('/admin/events/42/', '/admin/events/'), true);
});

test('does not match prefix siblings', () => {
	assert.equal(isNavigationPathActive('/app/homework', '/app/home'), false);
	assert.equal(isNavigationPathActive('/admin/users-archived', '/admin/users'), false);
});

test('does not match app and admin paths across navigation areas', () => {
	assert.equal(isNavigationPathActive('/admin/home', '/app/home'), false);
	assert.equal(isNavigationPathActive('/app/events', '/admin/events'), false);
});