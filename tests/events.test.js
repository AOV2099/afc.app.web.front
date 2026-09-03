import assert from 'node:assert/strict';
import test from 'node:test';

import {
	isFutureEvent,
	isPastEvent,
	isVisibleToUser
} from '../src/lib/utils/events.js';

const NOW = Date.parse('2026-09-01T18:00:00.000Z');

test('identifies events that ended at or before the current time', () => {
	assert.equal(isPastEvent({ ends_at: '2026-09-01T17:59:59.000Z' }, NOW), true);
	assert.equal(isPastEvent({ ends_at: '2026-09-01T18:00:00.000Z' }, NOW), true);
	assert.equal(isPastEvent({ ends_at: '2026-09-01T18:00:01.000Z' }, NOW), false);
});

test('uses ended status as fallback and ignores missing or invalid dates', () => {
	assert.equal(isPastEvent({ status: 'ended' }, NOW), true);
	assert.equal(isPastEvent({ ends_at: 'invalid' }, NOW), false);
	assert.equal(isPastEvent({}, NOW), false);
});

test('supports mapped event date shapes', () => {
	assert.equal(isPastEvent({ isPast: true }, NOW), true);
	assert.equal(isPastEvent({ endsAt: '2026-08-31T18:00:00.000Z' }, NOW), true);
	assert.equal(isPastEvent({ raw: { ends_at: '2026-08-31T18:00:00.000Z' } }, NOW), true);
});

test('identifies only non-cancelled events that start in the future', () => {
	assert.equal(isFutureEvent({ starts_at: '2026-09-01T18:00:01.000Z' }, NOW), true);
	assert.equal(isFutureEvent({ starts_at: '2026-09-01T18:00:00.000Z' }, NOW), false);
	assert.equal(isFutureEvent({ starts_at: '2026-08-31T18:00:00.000Z' }, NOW), false);
	assert.equal(
		isFutureEvent({ starts_at: '2026-09-02T18:00:00.000Z', status: 'cancelled' }, NOW),
		false
	);
	assert.equal(
		isFutureEvent({ raw: { starts_at: '2026-09-02T18:00:00.000Z', status: 'published' } }, NOW),
		true
	);
});

test('keeps expired events visible only through their Mexico City calendar day', () => {
	const midnight = Date.parse('2026-09-02T06:00:00.000Z');
	assert.equal(isVisibleToUser({ ends_at: '2026-09-02T05:59:59.000Z' }, midnight), false);
	assert.equal(isVisibleToUser({ ends_at: '2026-09-02T06:00:00.000Z' }, midnight), true);
	assert.equal(isVisibleToUser({ ends_at: '2026-09-02T12:00:00.000Z' }, midnight), true);
	assert.equal(isVisibleToUser({ status: 'ended' }, NOW), false);
	assert.equal(isVisibleToUser({ status: 'cancelled', ends_at: NOW + 1 }, NOW), false);
});