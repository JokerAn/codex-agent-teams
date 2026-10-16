import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { summarizePickupOptions } from './summary.mjs';

const modulePath = process.env.PROBE_MODULE;
assert.ok(modulePath, 'PROBE_MODULE must identify the module under acceptance');
const { filterPickupSliceTimes: filter, isPickupTimeAvailable: available } = await import(pathToFileURL(modulePath));
const now = new Date(2026, 9, 16, 15, 30).getTime();
const input = () => [
  { dateKey: '2026-10-16', tag: 'today', timesRanges: [
    { startTime: '17:29:59', endTime: '18:00:00' },
    { startTime: '17:30:00', endTime: '18:00:00', id: 'edge' },
    { startTime: '18:30:00', endTime: '19:00:00', id: 'late' },
  ] },
  { dateKey: '2026-10-17', tag: 'tomorrow', timesRanges: [{ startTime: '09:00:00', endTime: '10:00:00' }] },
];

test('default retains the original two-hour threshold, order and metadata', () => {
  const result = filter(input(), now);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0].timesRanges.map(range => range.id), ['edge', 'late']);
  assert.equal(result[0].tag, 'today');
  assert.equal(available('2026-10-16', '17:29:59', now), false);
  assert.equal(available('2026-10-16', '17:30:00', now), true);
});

test('excluded dates are matched exactly, regardless of order or duplicates', () => {
  assert.deepEqual(filter(input(), now, ['2026-10-17']).map(day => day.dateKey), ['2026-10-16']);
  assert.deepEqual(filter(input(), now, ['2026-10-17', '2026-10-16', '2026-10-16']), []);
  assert.equal(filter(input(), now, ['2026-10', '2026-10-16 ', 20261016]).length, 2);
});

test('empty exclusion list is backward compatible and unrelated dates are harmless', () => {
  assert.deepEqual(filter(input(), now, []), filter(input(), now));
  assert.deepEqual(filter(input(), now, ['2099-01-01']), filter(input(), now));
  assert.deepEqual(filter([], now, []), []);
});

test('invalid exclusion types are rejected including an empty date list', () => {
  for (const value of [null, '', {}, new Set(), 0, false]) {
    assert.throws(() => filter(input(), now, value), TypeError);
    assert.throws(() => filter([], now, value), TypeError);
  }
});

test('input data and the exclusion list remain unchanged when frozen', () => {
  const dates = input();
  const before = JSON.stringify(dates);
  for (const day of dates) {
    day.timesRanges.forEach(Object.freeze);
    Object.freeze(day.timesRanges);
    Object.freeze(day);
  }
  Object.freeze(dates);
  const exclusions = Object.freeze(['2026-10-17']);
  assert.equal(filter(dates, now, exclusions).length, 1);
  assert.equal(JSON.stringify(dates), before);
  assert.deepEqual(exclusions, ['2026-10-17']);
});

test('the threshold crosses midnight in the caller local timezone', () => {
  const midnightNow = new Date(2026, 9, 16, 23, 30).getTime();
  assert.equal(available('2026-10-17', '01:29:59', midnightNow), false);
  assert.equal(available('2026-10-17', '01:30:00', midnightNow), true);
});

test('captain adapter aggregates the member filter result', () => {
  assert.deepEqual(summarizePickupOptions(filter, input(), now, ['2026-10-17']), {
    availableDates: 1, availableRanges: 2,
    firstAvailable: { dateKey: '2026-10-16', startTime: '17:30:00' },
  });
});

test('captain adapter handles no available dates', () => {
  assert.deepEqual(summarizePickupOptions(filter, input(), now, ['2026-10-16', '2026-10-17']), {
    availableDates: 0, availableRanges: 0, firstAvailable: null,
  });
});

test('test module introduces no unbraced if/else statement', () => {
  // This small experiment has only a handful of conditionals; verify changed
  // conditionals manually as well. This check intentionally rejects common forms.
  const source = readFileSync(modulePath, 'utf8');
  assert.equal(/\bif\s*\([^\n]+\)\s*(?:return|throw)\b/.test(source), false);
});
