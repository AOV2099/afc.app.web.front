import assert from 'node:assert/strict';
import test from 'node:test';

import {
	DEFAULT_USER_FILTERS,
	USER_FILTERS_STORAGE_KEY,
	countActiveUserFilters,
	loadUserFilters,
	normalizeUserFilters,
	saveUserFilters
} from '../src/lib/services/adminUserFilters.js';

const OPTIONS = { roleOptions: ['student', 'staff'], statusOptions: ['active', 'inactive'], sortFields: ['name', 'hours'] };

function memoryStorage(initial = {}) {
	const data = new Map(Object.entries(initial));
	return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) };
}

test('saved filters survive a reload', () => {
	const storage = memoryStorage();
	const filters = { roleFilter: 'student', statusFilter: 'active', studySystemFilter: 'sua', careerFilter: '21', sortBy: 'hours', sortDirection: 'desc' };
	saveUserFilters(storage, filters);
	assert.deepEqual(loadUserFilters(storage, OPTIONS), filters);
});

test('unknown or corrupt saved values fall back to defaults', () => {
	assert.deepEqual(
		normalizeUserFilters({ roleFilter: 'root', statusFilter: 'x', studySystemFilter: 'otro', careerFilter: '1;DROP', sortBy: 'password', sortDirection: 'up' }, OPTIONS),
		DEFAULT_USER_FILTERS
	);
	assert.deepEqual(loadUserFilters(memoryStorage({ [USER_FILTERS_STORAGE_KEY]: '{no es json' }), OPTIONS), DEFAULT_USER_FILTERS);
	assert.deepEqual(loadUserFilters(null, OPTIONS), DEFAULT_USER_FILTERS);
	assert.equal(normalizeUserFilters({ careerFilter: 'none' }, OPTIONS).careerFilter, 'none');
});

test('active filter count ignores defaults and a locked career', () => {
	const filters = { ...DEFAULT_USER_FILTERS, roleFilter: 'student', careerFilter: '21' };
	assert.equal(countActiveUserFilters(filters), 2);
	assert.equal(countActiveUserFilters(filters, { careerLocked: true }), 1);
	assert.equal(countActiveUserFilters(DEFAULT_USER_FILTERS), 0);
});
