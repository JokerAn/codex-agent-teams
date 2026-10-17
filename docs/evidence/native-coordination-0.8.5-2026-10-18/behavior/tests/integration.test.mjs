import test from 'node:test';
import assert from 'node:assert/strict';
import { card } from '../src/card.mjs';
import { list } from '../src/list.mjs';
test('card with store', async () => assert.equal(await card('missing'), 'No record'));
test('list with store', async () => assert.deepEqual(await list(['a','missing']), ['a']));

// These checks use only currently inspectable paths. The two original missing
// checks above remain pending until the provider hands off contract revision 2.
test('available: store found tagged result', async () => {
  const { loadRecord } = await import('../src/store.mjs');
  assert.deepEqual(await loadRecord('a'), { kind: 'found', record: { id: 'a' } });
});
test('available: card found with real store', async () => {
  // Current presentation only; acceptance of the colon change needs card owner confirmation.
  assert.equal(await card('a'), 'Record: a');
});
test('available: list found with real store', async () => {
  assert.deepEqual(await list(['a', 'b']), ['a', 'b']);
});
test('available: empty id rejects through real store and consumers', async () => {
  const { loadRecord } = await import('../src/store.mjs');
  await assert.rejects(loadRecord(''), TypeError);
  await assert.rejects(card(''), TypeError);
  await assert.rejects(list(['']), TypeError);
});
test('available: non-string id rejects under revision 2', async () => {
  const { loadRecord } = await import('../src/store.mjs');
  await assert.rejects(loadRecord(42));
});
test('available: consumers preserve injected I/O rejection', async () => {
  const failure = new Error('controlled I/O rejection');
  const reject = async () => { throw failure; };
  await assert.rejects(card('a', reject), error => error === failure);
  await assert.rejects(list(['a'], reject), error => error === failure);
});
