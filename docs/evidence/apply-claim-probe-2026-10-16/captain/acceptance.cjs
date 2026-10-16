const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const { previewBooking } = require('./integration.cjs')

const root = process.env.PROBE_ROOT || path.resolve(__dirname, '..', process.env.PROBE_ARM || 'serial-high')
const scope = process.env.PROBE_SCOPE || 'both'
const dateSource = readFileSync(path.join(root, 'src/config/dateTz.js'), 'utf8')
const pickupSource = readFileSync(path.join(root, 'src/views/apply/components/pickup-time.js'), 'utf8')
const loadDate = (intl = Intl) => vm.runInNewContext(
  dateSource.replace(/^export\s+/gm, '') + '\n({ parseAsBeijing, getShanghaiParts })',
  { Date, Intl: intl }
)
const dateApi = loadDate()
const pickupApi = vm.runInNewContext(
  pickupSource.replace(/^export\s+/gm, '') + '\n({ isPickupTimeAvailable, filterPickupSliceTimes })',
  { Date, Number }
)
const plain = value => JSON.parse(JSON.stringify(value))
const midnight = { nian: 2026, yue: '01', ri: '01', shi: '00', fen: '00', miao: '00' }
const placeholder = { nian: '--', yue: '--', ri: '--', shi: '--', fen: '--', miao: '--' }
const stamp = Date.parse('2025-12-31T16:00:00Z')
const now = new Date(2026, 9, 16, 15, 30).getTime()
const makeRows = () => [{
  dateKey: '2026-10-16', label: 'today', custom: 7,
  timesRanges: [
    { startTime: '15:30:00', endTime: '16:30:00', id: 'zero' },
    { startTime: '16:00:00', endTime: '17:00:00', id: 'half' },
    { startTime: '17:30:00', endTime: '18:30:00', id: 'default' }
  ]
}]

if (scope !== 'pickup') {
  test('date: Date, timestamp, Z and offset strings describe the same instant', () => {
    for (const value of [new Date(stamp), stamp, '2025-12-31T16:00:00Z', '2026-01-01T00:00:00+08:00', '2025-12-31T11:00:00-05:00']) {
      assert.deepEqual(plain(dateApi.getShanghaiParts(value)), midnight)
    }
  })
  test('date: epoch zero remains a number with Beijing time 08:00', () => {
    assert.deepEqual(plain(dateApi.getShanghaiParts(0)), {
      nian: 1970, yue: '01', ri: '01', shi: '08', fen: '00', miao: '00'
    })
  })
  test('date: invalid values produce placeholders without throwing', () => {
    for (const value of [NaN, Infinity, -Infinity, new Date(NaN), 'invalid']) {
      assert.deepEqual(plain(dateApi.getShanghaiParts(value)), placeholder)
    }
  })
  test('date: parsing Beijing midnight and copying Date remain unchanged', () => {
    assert.equal(dateApi.parseAsBeijing('2024/02/29').toISOString(), '2024-02-28T16:00:00.000Z')
    const source = new Date(stamp)
    const copy = dateApi.parseAsBeijing(source)
    assert.notEqual(copy, source)
    copy.setUTCFullYear(2030)
    assert.equal(source.getTime(), stamp)
  })
  for (const mode of ['throws', 'ignores-zone']) {
    test(`date: Intl ${mode} fallback agrees and caches rejection`, () => {
      let calls = 0
      const fallback = loadDate({ DateTimeFormat: function () {
        calls += 1
        if (mode === 'throws') {
          throw new Error('Intl unavailable')
        }
        return { formatToParts: () => [{ type: 'hour', value: '00' }] }
      } })
      for (const value of [stamp, new Date(stamp), '2025-12-31T16:00:00Z']) {
        assert.deepEqual(plain(fallback.getShanghaiParts(value)), midnight)
      }
      assert.equal(calls, 1)
    })
  }
}

if (scope !== 'date') {
  test('pickup: default two-hour boundary includes equality but excludes one millisecond early', () => {
    assert.equal(pickupApi.isPickupTimeAvailable('2026-10-16', '17:30:00', now), true)
    assert.equal(pickupApi.isPickupTimeAvailable('2026-10-16', '17:30:00', now + 1), false)
  })
  test('pickup: zero and fractional advance are honored', () => {
    assert.equal(pickupApi.isPickupTimeAvailable('2026-10-16', '15:30:00', now, 0), true)
    assert.equal(pickupApi.isPickupTimeAvailable('2026-10-16', '16:00:00', now, 0.5), true)
    assert.equal(pickupApi.isPickupTimeAvailable('2026-10-16', '15:59:59', now, 0.5), false)
  })
  test('pickup: invalid hours and clocks fail closed without coercion', () => {
    for (const hours of [null, '0', false, -1, NaN, Infinity, -Infinity]) {
      assert.equal(pickupApi.isPickupTimeAvailable('2026-10-16', '23:00:00', now, hours), false)
      assert.deepEqual(plain(pickupApi.filterPickupSliceTimes(makeRows(), now, hours)), [])
    }
    for (const clock of [null, '0', false, NaN, Infinity, -Infinity]) {
      assert.equal(pickupApi.isPickupTimeAvailable('2026-10-16', '23:00:00', clock, 0), false)
      assert.deepEqual(plain(pickupApi.filterPickupSliceTimes(makeRows(), clock, 0)), [])
    }
  })
  test('pickup: filter forwards advance and preserves fields and frozen inputs', () => {
    const rows = makeRows()
    for (const row of rows) {
      row.timesRanges.forEach(Object.freeze)
      Object.freeze(row.timesRanges)
      Object.freeze(row)
    }
    Object.freeze(rows)
    const selected = pickupApi.filterPickupSliceTimes(rows, now, 0.5)
    assert.deepEqual(Array.from(selected[0].timesRanges, range => range.id), ['half', 'default'])
    assert.equal(selected[0].custom, 7)
    assert.equal(selected[0].label, 'today')
    assert.equal(rows[0].timesRanges.length, 3)
    assert.notEqual(selected[0], rows[0])
  })
  test('pickup: threshold spans midnight and invalid starts remain unavailable', () => {
    const late = new Date(2026, 11, 31, 23, 45).getTime()
    assert.equal(pickupApi.isPickupTimeAvailable('2027-01-01', '00:15:00', late, 0.5), true)
    assert.equal(pickupApi.isPickupTimeAvailable('2027-01-01', '00:14:59', late, 0.5), false)
    assert.equal(pickupApi.isPickupTimeAvailable('invalid', '12:00:00', now, 0), false)
    assert.equal(pickupApi.filterPickupSliceTimes([], now, 0).length, 0)
  })
}

if (scope === 'both') {
  test('integration: captain caller displays Beijing clock and honors zero-hour selection', () => {
    const output = previewBooking({ ...dateApi, ...pickupApi }, makeRows(), now, 0)
    const p = dateApi.getShanghaiParts(new Date(now))
    assert.equal(output.beijingNow, `${p.nian}-${p.yue}-${p.ri} ${p.shi}:${p.fen}:${p.miao}`)
    assert.equal(output.selectableSlots, 3)
  })
}

if (process.env.PROBE_DIRTY === '1') {
  test('dirty: non-array lists and primitive entries produce no slots', () => {
    for (const rows of [null, undefined, {}, 'invalid', 12]) {
      assert.deepEqual(plain(pickupApi.filterPickupSliceTimes(rows, now, 0)), [])
    }
    assert.deepEqual(plain(pickupApi.filterPickupSliceTimes([null, undefined, false, 42, 'invalid', {}], now, 0)), [])
  })
  test('dirty: malformed range collections and individual ranges are skipped', () => {
    const valid = Object.freeze({ startTime: '17:30:00', endTime: '18:30:00', id: 'keep' })
    const ranges = Object.freeze([null, undefined, false, 1, 'invalid', {}, { startTime: 'invalid' }, valid])
    const keep = Object.freeze({ dateKey: '2026-10-16', label: 'keep-label', timesRanges: ranges })
    const input = Object.freeze([
      { dateKey: '2026-10-16', timesRanges: 1 },
      { dateKey: '2026-10-16', timesRanges: {} },
      { dateKey: '2026-10-16', timesRanges: 'invalid' },
      { dateKey: 'invalid', timesRanges: [valid] },
      keep
    ])
    const selected = pickupApi.filterPickupSliceTimes(input, now, 0)
    assert.equal(selected.length, 1)
    assert.equal(selected[0].label, 'keep-label')
    assert.deepEqual(plain(selected[0].timesRanges), [valid])
    assert.equal(keep.timesRanges.length, 8)
    assert.notEqual(selected[0], keep)
  })
}
