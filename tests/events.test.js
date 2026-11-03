import assert from 'node:assert/strict';
import test from 'node:test';

import {
	exploreEventsForStudent,
	isFutureEvent,
	isRegistrationOpen,
	isPastEvent,
	isVisibleToUser,
	nearestDayItems
} from '../src/lib/utils/events.js';

const NOW = Date.parse('2026-09-01T18:00:00.000Z');

test('keeps only the events of the nearest day, in start order', () => {
	const at = (iso) => ({ ms: Date.parse(iso) });
	const later = at('2026-09-03T15:00:00.000Z');
	const sameDayLate = at('2026-09-02T19:00:00.000Z');
	const sameDayEarly = at('2026-09-02T15:00:00.000Z');
	const result = nearestDayItems([later, sameDayLate, sameDayEarly, { ms: NaN }], (item) => item.ms, NOW);
	assert.deepEqual(result, [sameDayEarly, sameDayLate]);
	assert.deepEqual(nearestDayItems([], (item) => item.ms, NOW), []);
});

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

test('student explore keeps started and same-day ended events, drops ended days and cancelled ones', () => {
	const inProgress = { id: 1, status: 'published', starts_at: '2026-09-01T17:30:00.000Z', ends_at: '2026-09-01T19:30:00.000Z' };
	const upcoming = { id: 2, status: 'published', starts_at: '2026-09-01T20:00:00.000Z', ends_at: '2026-09-01T22:00:00.000Z' };
	const endedToday = { id: 3, status: 'published', starts_at: '2026-09-01T15:00:00.000Z', ends_at: '2026-09-01T17:00:00.000Z' };
	const cancelled = { id: 4, status: 'cancelled', starts_at: '2026-09-01T17:30:00.000Z', ends_at: '2026-09-01T19:30:00.000Z' };
	const ended = { id: 5, status: 'ended', starts_at: '2026-09-01T17:30:00.000Z', ends_at: '2026-09-01T19:30:00.000Z' };
	const endedYesterday = { id: 6, status: 'published', starts_at: '2026-08-31T15:00:00.000Z', ends_at: '2026-08-31T17:00:00.000Z' };
	const result = exploreEventsForStudent([inProgress, upcoming, endedToday, cancelled, ended, endedYesterday], NOW);
	assert.deepEqual(result.map((event) => event.id), [1, 2, 3]);
	assert.equal(isPastEvent(endedToday, NOW), true, 'visible pero finalizado: la tarjeta se deshabilita');
	assert.deepEqual(exploreEventsForStudent(null, NOW), []);
});

test('an event that ended late at night disappears at Mexico City midnight', () => {
	const lateEvent = { status: 'published', starts_at: '2026-09-02T02:00:00.000Z', ends_at: '2026-09-02T04:00:00.000Z' };
	assert.equal(exploreEventsForStudent([lateEvent], Date.parse('2026-09-02T05:59:59.000Z')).length, 1);
	assert.equal(exploreEventsForStudent([lateEvent], Date.parse('2026-09-02T06:00:00.000Z')).length, 0);
});

test('event times compare by instant, regardless of the UTC offset they were sent with', () => {
	const utc = { status: 'published', starts_at: '2026-09-01T17:30:00.000Z', ends_at: '2026-09-01T19:30:00.000Z' };
	const mexico = { status: 'published', starts_at: '2026-09-01T11:30:00-06:00', ends_at: '2026-09-01T13:30:00-06:00' };
	const tokyo = { status: 'published', starts_at: '2026-09-02T02:30:00+09:00', ends_at: '2026-09-02T04:30:00+09:00' };
	for (const event of [utc, mexico, tokyo]) {
		assert.equal(exploreEventsForStudent([event], NOW).length, 1);
		assert.equal(isPastEvent(event, Date.parse('2026-09-01T19:30:00.000Z')), true);
	}
});

test('free registration stays open after the start; manual review closes at the start', () => {
	const times = { status: 'published', starts_at: '2026-09-01T17:30:00.000Z', ends_at: '2026-09-01T19:30:00.000Z' };
	const before = Date.parse('2026-09-01T17:00:00.000Z');
	const ended = Date.parse('2026-09-01T19:30:00.000Z');

	assert.equal(isRegistrationOpen({ ...times, registration_mode: 'auto' }, before), true);
	assert.equal(isRegistrationOpen({ ...times, registration_mode: 'auto' }, NOW), true);
	assert.equal(isRegistrationOpen({ ...times, registration_mode: 'auto' }, ended), false);

	assert.equal(isRegistrationOpen({ ...times, registration_mode: 'manual_review' }, before), true);
	assert.equal(isRegistrationOpen({ ...times, registration_mode: 'manual_review' }, NOW), false);
	assert.equal(isRegistrationOpen({ raw: { ...times, registration_mode: 'manual_review' } }, NOW), false);

	assert.equal(isRegistrationOpen({ ...times, registration_mode: 'auto', status: 'cancelled' }, before), false);
});