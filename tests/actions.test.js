import test from 'node:test';
import assert from 'node:assert/strict';
import { recordAction, actionLimits } from '../src/actions.js';

test('official lifecycle metadata records command completion while omitting all payloads', () => {
  const journal = { items: [], truncated: false };
  const item = { id: 'command', type: 'commandExecution', cwd: '/project', status: 'inProgress', command: 'SECRET', aggregatedOutput: 'SECRET' };
  assert.equal(recordAction(journal, 'item/started', { item, startedAtMs: 1000 }), true);
  assert.equal(recordAction(journal, 'item/started', { item, startedAtMs: 1000 }), false);
  assert.equal(journal.items[0].exitCode, null);
  assert.equal(recordAction(journal, 'item/completed', { item: { ...item, status: 'failed', exitCode: 7, durationMs: 200 }, completedAtMs: 1200 }), true);
  assert.equal(journal.items[0].startedAt, '1970-01-01T00:00:01.000Z');
  assert.equal(journal.items[0].exitCode, 7);
  assert.equal(recordAction(journal, 'item/started', { item }), false, 'late start cannot reopen completion');
  assert.equal(recordAction(journal, 'item/completed', { item: { ...item, exitCode: 0 } }), false);
  assert.ok(!JSON.stringify(journal).includes('SECRET'));
});

test('partial/unknown items stay truthful, tool metadata and journal stay bounded by bytes', () => {
  const journal = { items: [], truncated: false };
  assert.equal(recordAction(journal, 'item/started', { item: { id: 'a', type: 'agentMessage' } }), false);
  assert.equal(recordAction(journal, 'item/started', { item: { id: 'a', type: 'mcpToolCall', status: 'future', tool: '中'.repeat(1000), arguments: 'SECRET', result: 'SECRET' } }), true);
  assert.equal(journal.items[0].status, null);
  assert.equal(journal.items[0].cwd, null);
  assert.equal(journal.items[0].startedAt, null);
  assert.ok(!journal.items[0].tool.includes('\uFFFD'));
  for (let i = 1; i < 150; i++) recordAction(journal, 'item/completed', { item: { id: String(i), type: 'commandExecution', cwd: '\\"'.repeat(60), status: 'completed', exitCode: 0 } });
  assert.equal(journal.items.length, actionLimits.items);
  assert.equal(journal.truncated, true);
  for (const entry of journal.items) assert.ok(Buffer.byteLength(JSON.stringify(entry)) <= actionLimits.itemBytes);
  assert.ok(Buffer.byteLength(JSON.stringify(journal)) <= actionLimits.totalBytes);
  assert.ok(!JSON.stringify(journal).includes('SECRET'));
  assert.equal(recordAction(journal, 'item/completed', { item: { id: 'a', type: 'mcpToolCall', status: 'completed' } }), true, 'retained starts can complete even after capacity is reached');
});
