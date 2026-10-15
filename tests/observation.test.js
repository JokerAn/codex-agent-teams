import test from 'node:test';
import assert from 'node:assert/strict';
import { TaskObserver } from '../src/observation.js';
import { toolFeedback } from '../src/status.js';

const fixture = () => {
  const task = { id: 'task', objective: 'fixture', status: 'running', dependencies: [], updatedAt: '2026-10-14T00:00:00Z',
    attempts: [{ id: 'attempt', status: 'running', phase: 'member', startedAt: '2026-10-14T00:00:00Z' }] };
  return { task, snapshot: { target: { root: '/a' }, tasks: [task], workspaces: [], owner: { processAlive: true } } };
};

test('unchanged cursors avoid task packets and elapsed time does not manufacture updates', () => {
  const { task, snapshot } = fixture(), observer = new TaskObserver();
  task.context = ['x'.repeat(100000)];
  const first = observer.observe(task, snapshot);
  assert.equal(first.unchanged, false);
  const unchanged = observer.observe(task, snapshot, { afterCursor: first.cursor });
  assert.equal(unchanged.unchanged, true);
  assert.ok(Buffer.byteLength(JSON.stringify(unchanged)) < 1024);
  assert.equal(unchanged.objective, undefined);
  task.updatedAt = '2026-10-14T00:00:01Z'; task.attempts[0].phase = 'verification';
  const changed = observer.observe(task, snapshot, { afterCursor: first.cursor });
  assert.equal(changed.unchanged, false);
  assert.equal(changed.phase, 'verification');
  assert.equal(changed.objective, undefined);
  snapshot.owner = null;
  const orphan = observer.observe(task, snapshot, { afterCursor: changed.cursor });
  assert.equal(orphan.elapsedMs, null); assert.match(orphan.nextAction, /owner/);
});

test('cursors refuse tampering, reconnect and cross-project/task/attempt reuse', () => {
  const { task, snapshot } = fixture(), observer = new TaskObserver();
  const cursor = observer.observe(task, snapshot).cursor;
  assert.throws(() => observer.observe(task, snapshot, { afterCursor: cursor + 'x' }), /Invalid or expired/);
  assert.throws(() => new TaskObserver().observe(task, snapshot, { afterCursor: cursor }), /Invalid or expired/);
  const copy = structuredClone(task);
  assert.throws(() => observer.observe(copy, { ...snapshot, target: { root: '/b' } }, { afterCursor: cursor }), /another workspace/);
  copy.id = 'other';
  assert.throws(() => observer.observe(copy, snapshot, { afterCursor: cursor }), /another workspace/);
  copy.id = task.id; copy.attempts[0].id = 'retry';
  assert.throws(() => observer.observe(copy, snapshot, { afterCursor: cursor }), /another workspace/);
  assert.throws(() => observer.decode('not.a.cursor'), /full snapshot/);
});

test('changed cursor feedback carries bounded next action and error', () => {
  const { task, snapshot } = fixture(), observer = new TaskObserver();
  const first = observer.observe(task, snapshot);
  task.status = 'failed'; task.attempts[0].status = 'failed'; task.attempts[0].endedAt = '2026-10-14T00:00:01Z';
  task.updatedAt = '2026-10-14T00:00:01Z'; task.error = 'schema rejection';
  const changed = observer.observe(task, snapshot, { afterCursor: first.cursor });
  const feedback = toolFeedback('teams_status', changed);
  assert.match(feedback, /下一步：主 Agent/);
  assert.match(feedback, /错误：schema rejection/);
  assert.match(feedback, /执行耗时/);
});

test('changed summaries follow reviewer actions without falling back to the writer', () => {
  const { task, snapshot } = fixture(), observer = new TaskObserver();
  const attempt = task.attempts[0];
  attempt.actions = { items: [{ id: 'writer', completed: true }], truncated: false };
  let previous = observer.observe(task, snapshot);
  attempt.phase = 'independent_review';
  attempt.machineReview = { status: 'running', actions: { items: [], truncated: false } };
  let changed = observer.observe(task, snapshot, { afterCursor: previous.cursor });
  assert.equal(changed.lastAction, null, 'a reviewer with no actions must not show the old writer action');
  assert.equal(changed.lastActionRole, 'reviewer');
  for (const completed of [false, true]) {
    previous = changed;
    attempt.machineReview.actions.items = [{ id: 'reviewer', completed }];
    changed = observer.observe(task, snapshot, { afterCursor: previous.cursor });
    assert.equal(changed.unchanged, false);
    assert.deepEqual(changed.lastAction, attempt.machineReview.actions.items.at(-1));
    assert.equal(changed.lastActionRole, 'reviewer');
  }
  previous = changed;
  task.status = attempt.status = 'awaiting_review';
  attempt.machineReview.status = 'passed';
  changed = observer.observe(task, snapshot, { afterCursor: previous.cursor });
  assert.equal(changed.lastAction.id, 'reviewer', 'terminal summaries keep the latest model role');
  assert.equal(changed.lastActionRole, 'reviewer');
  assert.equal(observer.observe(task, snapshot, { afterCursor: changed.cursor }).unchanged, true);
});

test('member-only changed summaries retain member action ownership', () => {
  const { task, snapshot } = fixture(), observer = new TaskObserver();
  const first = observer.observe(task, snapshot);
  task.attempts[0].actions = { items: [{ id: 'member', completed: false }] };
  const changed = observer.observe(task, snapshot, { afterCursor: first.cursor });
  assert.equal(changed.lastAction.id, 'member');
  assert.equal(changed.lastActionRole, 'member');
});
