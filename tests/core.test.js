import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { TaskStore } from '../src/store.js';
import { taskPrompt } from '../src/policy.js';
import { setup, contract, report, approve, config, tick } from './helpers.js';
import { taskView } from '../src/status.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) {
  const deadline = Date.now() + 5000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error('Test condition timed out'); await delay(10); }
}

test('completion requires captain review before unlocking a dependency', async t => {
  const { runtime } = setup(t);
  const first = runtime.create(contract);
  const dependent = runtime.create({ ...contract, dependencies: [first.id] });
  assert.throws(() => runtime.start(dependent.id), /Dependencies/);
  runtime.start(first.id);
  assert.equal((await runtime.wait(first.id)).status, 'awaiting_review');
  assert.throws(() => runtime.start(dependent.id), /Dependencies/);
  assert.equal(approve(runtime, first.id).status, 'succeeded');
  runtime.start(dependent.id);
  assert.equal((await runtime.wait(dependent.id)).status, 'awaiting_review');
});

test('fresh packet excludes arbitrary parent-history fields; schema rejects them', t => {
  const { runtime } = setup(t);
  assert.throws(() => runtime.create({ ...contract, parentHistory: 'SECRET_PARENT_SENTINEL' }));
  const task = runtime.create(contract);
  assert.ok(!taskPrompt({ ...task, parentHistory: 'SECRET_PARENT_SENTINEL', attempts: ['SECRET_PARENT_SENTINEL'] }, []).includes('SECRET_PARENT_SENTINEL'));
  assert.throws(() => runtime.create({ ...contract, mode: 'workspace-write' }));
});

test('no implicit downgrade; qualified profile needs task-specific eligibility', t => {
  const { runtime } = setup(t);
  assert.throws(() => runtime.create({ ...contract, profile: 'qualified', complexity: 'bounded' }), /not eligible/);
  const defaultTask = runtime.create(contract);
  assert.equal(defaultTask.profile, 'auto');
});

test('qualified rejection retries on expert and old attempt cannot write back', async t => {
  const { runtime } = setup(t, undefined, { profiles: {
    ...config.profiles, qualified: { model: 'qualified-test-model', kinds: ['lookup'], evaluationReference: 'eval/local-lookup-v1' },
  } });
  const task = runtime.create({ ...contract, kind: 'lookup', complexity: 'bounded', profile: 'qualified' });
  const first = runtime.start(task.id);
  assert.equal(first.selection.model, 'qualified-test-model');
  await runtime.wait(task.id);
  runtime.review({ taskId: task.id, attemptId: first.attemptId, verdict: 'reject', evidence: [{ criterion: contract.acceptance[0], evidence: 'Missing another workspace package.' }] });
  assert.throws(() => runtime.start(task.id), /retry reason/);
  const second = runtime.start(task.id, { retry: true, reason: 'Inspect workspace manifest too.' });
  assert.equal(second.selection.model, 'strong-test-model');
  assert.equal(runtime.finish(task.id, first.attemptId, 'succeeded', {}), false);
  await runtime.wait(task.id);
  assert.throws(() => runtime.review({ taskId: task.id, attemptId: first.attemptId, verdict: 'pass', evidence: [{ criterion: contract.acceptance[0], evidence: 'stale' }] }), /Stale/);
});

test('claims without matching criteria or evidence cannot pass', async t => {
  const { runtime } = setup(t, { run: async () => ({ result: { ...report, criteria: [{ criterion: 'Made-up acceptance', satisfied: true, evidence: 'none' }] } }) });
  const task = runtime.create(contract);
  runtime.start(task.id);
  const state = await runtime.wait(task.id);
  assert.equal(state.status, 'failed');
  assert.match(state.error, /original order/);
});

test('blocker report never enters the review-pass path', async t => {
  const { runtime } = setup(t, { run: async () => ({ result: { ...report, blockers: ['Repository is incomplete'] } }) });
  const task = runtime.create(contract);
  runtime.start(task.id);
  assert.equal((await runtime.wait(task.id)).status, 'blocked');
  assert.throws(() => approve(runtime, task.id), /not awaiting review/);
});

test('all criteria need real captain evidence in contract order', async t => {
  const { runtime } = setup(t);
  const task = runtime.create(contract);
  const attempt = runtime.start(task.id);
  await runtime.wait(task.id);
  assert.throws(() => runtime.review({ taskId: task.id, attemptId: attempt.attemptId, verdict: 'pass', evidence: [{ criterion: contract.acceptance[0], evidence: '' }] }));
});

test('concurrency, bounded wait and cancellation preserve capacity until exit', async t => {
  const backend = { run: ({ signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => setTimeout(() => reject(signal.reason), 15), { once: true })) };
  const { runtime } = setup(t, backend, { maxConcurrency: 1 });
  const a = runtime.create(contract), b = runtime.create(contract);
  runtime.start(a.id);
  assert.throws(() => runtime.start(b.id), /Concurrency/);
  assert.equal((await runtime.wait(a.id, 1)).status, 'running');
  const cancelling = runtime.cancel(a.id);
  assert.throws(() => runtime.start(b.id), /Concurrency/);
  assert.equal((await cancelling).status, 'cancelled');
  runtime.start(b.id);
  await runtime.cancel(b.id);
  assert.equal(runtime.active.size, 0);
});

test('deadline cancels backend and records failure honestly', async t => {
  const backend = { run: ({ signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) };
  const { runtime } = setup(t, backend, { taskTimeoutMs: 20 });
  const task = runtime.create(contract);
  runtime.start(task.id);
  const state = await runtime.wait(task.id, 1000);
  // A deadline overrun is reported as its own outcome, not as a captain cancellation.
  assert.equal(state.status, 'timed_out');
  assert.match(state.error, /deadline/);
  assert.equal(state.failure.code, 'task_deadline_exceeded');
  assert.ok(!/确认退出/.test(state.failure.nextAction));
});

test('a captain cancellation stays distinct from a deadline overrun', async t => {
  // Same AbortController, two different causes: the recorded outcome must not be interchangeable.
  const backend = { run: ({ signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) };
  const { runtime } = setup(t, backend, { taskTimeoutMs: 60000 });
  const task = runtime.create(contract);
  runtime.start(task.id);
  const cancelled = await runtime.cancel(task.id);
  assert.equal(cancelled.status, 'cancelled');
  // A captain cancellation records no phase-level failure: "which stage failed" is meaningless when the
  // captain stopped the run, and that bucket's guidance ("检查成员的原始错误") is actively wrong here.
  assert.equal(cancelled.failure, undefined);
  assert.match(cancelled.error, /Cancelled by captain/);
  assert.equal(taskView(cancelled).phaseLabel, '已取消');
  assert.match(taskView(cancelled).nextAction, /确认退出/);
});

test('a cancellation that lands just before the deadline stays a cancellation', async t => {
  // The captain aborts first, but the backend takes longer to unwind than the remaining deadline. The
  // deadline timer must not adopt an attempt the captain already owns: that produced status `timed_out`
  // with `error: "Cancelled by captain"` and a task_deadline_exceeded code, i.e. one event recorded as two
  // contradictory outcomes, plus a nextAction telling the user to raise a timeout they never reached.
  const backend = { run: ({ signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => setTimeout(() => reject(signal.reason), 150), { once: true });
  }) };
  const { runtime } = setup(t, backend, { taskTimeoutMs: 50 });
  const task = runtime.create(contract);
  runtime.start(task.id);
  await until(() => runtime.status(task.id).status === 'running');
  const cancelled = await runtime.cancel(task.id);
  assert.equal(cancelled.status, 'cancelled');
  assert.match(cancelled.error, /Cancelled by captain/);
  assert.equal(cancelled.failure, undefined);
  assert.equal(taskView(cancelled).phaseLabel, '已取消');
});

test('state has one owner and survives reopening', async t => {
  const { runtime, path } = setup(t);
  const task = runtime.create(contract);
  assert.throws(() => new TaskStore(path), /Another runtime/);
  await runtime.close();
  const reopened = new TaskStore(path);
  assert.equal(reopened.get(task.id).objective, contract.objective);
  reopened.close();
});

test('unclean exit marks running task interrupted, never replays it', async t => {
  const { runtime, path } = setup(t);
  const task = runtime.create(contract);
  await runtime.close();
  const storeUrl = new URL('../src/store.js', import.meta.url).href;
  const script = `import {TaskStore} from ${JSON.stringify(storeUrl)}; const s=new TaskStore(process.argv[1]); const t=s.get(process.argv[2]); t.status='running'; t.attempts=[{id:'old',status:'running'}]; s.save(t,'started'); process.exit(0);`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script, path, task.id], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  const recovered = new TaskStore(path);
  assert.equal(recovered.get(task.id).status, 'interrupted');
  assert.equal(recovered.get(task.id).attempts[0].status, 'interrupted');
  recovered.close();
});

test('retry guidance reaches the fresh member without replaying raw conversation', async t => {
  const packets = [];
  const backend = { run: async ({ prompt }) => { packets.push(JSON.parse(prompt)); return { result: structuredClone(report) }; } };
  const { runtime } = setup(t, backend);
  const task = runtime.create(contract);
  const first = runtime.start(task.id);
  await runtime.wait(task.id);
  runtime.review({ taskId: task.id, attemptId: first.attemptId, verdict: 'reject', evidence: [{ criterion: contract.acceptance[0], evidence: 'Workspace package was missed.' }] });
  runtime.start(task.id, { retry: true, reason: 'Inspect the workspace test script as well.' });
  await runtime.wait(task.id);
  assert.equal(packets[1].retryGuidance.reason, 'Inspect the workspace test script as well.');
  assert.equal(packets[1].retryGuidance.previousReview.verdict, 'reject');
  assert.equal(packets[1].retryGuidance.previousReview.attemptId, undefined);
  assert.ok(!('attempts' in packets[1]));
});

test('no unbounded failure retry loop', async t => {
  const { runtime } = setup(t, { run: async () => { throw new Error('fixture failure'); } });
  const task = runtime.create(contract);
  for (let i = 0; i < 3; i++) {
    runtime.start(task.id, i === 0 ? {} : { retry: true, reason: `new evidence ${i}` });
    assert.equal((await runtime.wait(task.id)).status, 'failed');
  }
  assert.throws(() => runtime.start(task.id, { retry: true, reason: 'again' }), /Three attempts exhausted/);
});

for (const outcome of ['failed', 'cancelled', 'invalid-result']) {
  test(`retry ${outcome} cannot expose the previous attempt execution`, async t => {
    const previous = { threadId: 'previous-thread', actualModel: 'previous-model', usage: { total: { totalTokens: 17 } } };
    let calls = 0, completeRetry;
    const { runtime } = setup(t, { run: async ({ signal }) => {
      if (++calls === 1) return { result: structuredClone(report), ...previous };
      return new Promise((resolve, reject) => {
        completeRetry = () => outcome === 'invalid-result' ? resolve({ result: {} }) : reject(new Error('retry failed'));
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    } });
    const task = runtime.create(contract), first = runtime.start(task.id);
    await runtime.wait(task.id);
    runtime.review({ taskId: task.id, attemptId: first.attemptId, verdict: 'reject', evidence: [{ criterion: contract.acceptance[0], evidence: 'Retry with original source evidence.' }] });
    runtime.start(task.id, { retry: true, reason: 'Inspect the original source.' });
    await tick();
    const running = runtime.status(task.id);
    assert.equal(running.status, 'running');
    assert.equal(running.execution, undefined);
    for (const [key, value] of Object.entries(previous)) assert.deepEqual(running.attempts[0].execution[key], value);
    if (outcome === 'cancelled') await runtime.cancel(task.id); else completeRetry();
    const ended = await runtime.wait(task.id);
    assert.equal(ended.status, outcome === 'cancelled' ? 'cancelled' : 'failed');
    assert.equal(ended.execution, undefined);
    assert.equal(ended.attempts[1].execution, undefined);
    for (const [key, value] of Object.entries(previous)) assert.deepEqual(ended.attempts[0].execution[key], value);
  });
}
