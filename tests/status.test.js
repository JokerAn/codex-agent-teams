import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { TaskStore } from '../src/store.js';
import { TaskRuntime } from '../src/runtime.js';
import { pluginIdentity, readSnapshot, overview, taskView, renderHtml, renderText, markPhase, toolFeedback } from '../src/status.js';
import { config, contract, report, tick } from './helpers.js';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'teams-status-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const configPath = join(root, 'config.json');
  writeFileSync(configPath, JSON.stringify({ workspace: root, profiles: config.profiles }));
  return { root, configPath, path: join(root, '.codex-teams/state.sqlite') };
}
const cli = (configPath, args) => execFileSync(process.execPath, [resolve('src/cli.js'), 'status', '--config', configPath, ...args], { encoding: 'utf8', stdio: 'pipe', timeout: 5000 });

test('observing an unused workspace does not create a database or acquire owner', t => {
  const f = fixture(t);
  const snapshot = readSnapshot(f.root), value = overview(snapshot);
  assert.equal(value.counts.total, 0);
  assert.equal(value.runtime, null);
  assert.equal(value.viewer.version, pluginIdentity().version);
  assert.deepEqual(JSON.parse(cli(f.configPath, [])), []);
  assert.equal(JSON.parse(cli(f.configPath, ['--overview'])).stateExists, false);
  assert.equal(existsSync(join(f.root, '.codex-teams')), false);
  assert.throws(() => readSnapshot(f.root, 'missing'), /Unknown task/);
});

test('CLI and snapshot read alongside a live owner without modifying task/event/owner state', async t => {
  const f = fixture(t), identity = { version: 'older-runtime', sourceRoot: '/fixture/cache' };
  const store = new TaskStore(f.path, identity);
  t.after(() => store.close());
  const runtime = new TaskRuntime(store, { run: async () => ({ result: report }) }, { ...config, workspace: f.root });
  const task = runtime.create(contract);
  const before = store.db.prepare('SELECT value FROM meta WHERE key=?').get('owner').value;
  const events = store.db.prepare('SELECT COUNT(*) AS total FROM events').get().total;
  const summary = JSON.parse(cli(f.configPath, ['--overview']));
  assert.equal(summary.runtime.version, 'older-runtime');
  assert.equal(summary.runtime.sourceRoot, '/fixture/cache');
  assert.equal(summary.runtime.processAlive, true);
  assert.notEqual(summary.viewer.version, summary.runtime.version);
  assert.equal('token' in summary.runtime, false);
  assert.deepEqual(JSON.parse(cli(f.configPath, ['--id', task.id])), store.get(task.id));
  assert.match(cli(f.configPath, ['--human']), /等待启动/);
  assert.equal(store.db.prepare('SELECT value FROM meta WHERE key=?').get('owner').value, before);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS total FROM events').get().total, events);
  assert.equal(store.get(task.id).status, 'pending');
  assert.throws(() => readSnapshot(f.root, 'missing'), /Unknown task/);
  const html = join(f.root, 'status.html');
  cli(f.configPath, ['--html', html]);
  assert.match(readFileSync(html, 'utf8'), /刷新页面不会重新读取数据库/);
  assert.throws(() => cli(f.configPath, ['--html', html]), /EEXIST/);
  assert.throws(() => cli(f.configPath, ['--limit', 'NaN', '--overview']), /integer from 1 to 100/);
  assert.throws(() => cli(f.configPath, ['--human', '--overview']), /Choose one/);
});

test('status never recovers stale running records or treats missing usage as zero', t => {
  const f = fixture(t), store = new TaskStore(f.path);
  const old = { id: 'old', objective: 'legacy task', status: 'running', createdAt: '2026-10-12T00:00:00Z', mode: 'read-only', dependencies: [], attempts: [{ id: 'attempt', startedAt: '2026-10-12T00:00:00Z', status: 'running' }] };
  store.save(old, 'fixture');
  store.close();
  const view = overview(readSnapshot(f.root), { at: '2026-10-12T00:00:05Z' });
  assert.equal(view.runtime, null);
  assert.equal(view.tasks[0].phase, 'unknown');
  assert.equal(view.tasks[0].memberUsage, null);
  assert.equal(view.tasks[0].elapsedMs, null);
  assert.match(view.tasks[0].nextAction, /先检查旧成员/);
  assert.match(view.warning, /未检测到 owner/);
  assert.equal(readSnapshot(f.root).tasks[0].status, 'running');
});

test('overview prioritizes active tasks and waits, keeps counts complete and enforces limits', () => {
  const make = (id, status) => ({ id, status, objective: id, mode: 'read-only', dependencies: [], attempts: [], updatedAt: '2026-10-12T00:00:00Z' });
  const tasks = [make('done','succeeded'), make('failed','failed'), make('wait','awaiting_review'), make('active','running')];
  const view = overview({ tasks, workspaces: [], owner: null, stateExists: true }, { limit: 2 });
  assert.deepEqual(view.tasks.map(task => task.taskId), ['active','wait']);
  assert.deepEqual(view.counts, { total:4, running:1, awaiting:1, succeeded:1, attention:1, pending:0 });
  assert.equal(view.omitted, 2);
  for (const limit of [0,101,1.5]) assert.throws(() => overview({tasks}, {limit}), /Status limit/);
});

test('phase history records transitions once, preserves retries and keeps awaiting states honest', async t => {
  const f = fixture(t), store = new TaskStore(f.path); t.after(() => store.close());
  let complete;
  const backend = { run: () => new Promise(resolve => { complete = () => resolve({ result: report }); }) };
  const runtime = new TaskRuntime(store, backend, { ...config, workspace: f.root });
  const task = runtime.create(contract);
  runtime.start(task.id);
  await tick();
  assert.equal(taskView(runtime.status(task.id)).phase, 'member');
  complete(); await runtime.wait(task.id);
  const state = runtime.status(task.id);
  assert.deepEqual(state.attempts[0].phases.map(phase => phase.phase), ['member','awaiting_review']);
  assert.ok(state.attempts[0].phases[0].endedAt);
  const view = taskView(state, [], '2030-01-01T00:00:00Z');
  assert.equal(view.phase, 'awaiting_review');
  assert.notEqual(view.phaseLabel, '已完成并验收');
  assert.equal(view.elapsedMs, Date.parse(state.attempts[0].endedAt) - Date.parse(state.attempts[0].startedAt));
  runtime.review({ taskId:task.id, attemptId:state.attempts[0].id, verdict:'reject', evidence:[{criterion:contract.acceptance[0],evidence:'fixture'}] });
  runtime.start(task.id,{retry:true,reason:'fresh evidence'});
  await tick(); complete(); await runtime.wait(task.id);
  assert.equal(runtime.status(task.id).attempts[0].phase, 'failed');
  assert.deepEqual(runtime.status(task.id).attempts[1].phases.map(phase=>phase.phase), ['member','awaiting_review']);
  await runtime.cancel(task.id);
  assert.equal(runtime.status(task.id).attempts[1].phase, 'cancelled');
});

test('status separates member/reviewer usage, command receipts and captain authority', () => {
  const task = {id:'task',objective:'audit',status:'awaiting_integration',mode:'workspace-write',dependencies:[],attempts:[{id:'attempt',startedAt:'2026-10-12T00:00:00Z',endedAt:'2026-10-12T00:00:01Z',workspaceId:'workspace',verificationId:'verify',review:{verdict:'pass'},execution:{usage:{total:{totalTokens:100,inputTokens:80,cachedInputTokens:60,outputTokens:20}}},machineReview:{status:'passed',usage:{total:{totalTokens:30}}},candidate:{patchPath:'/patch'},integration:{startedAt:'2026-10-12T00:00:02Z',endedAt:'2026-10-12T00:00:03Z',verificationId:'source'}}]};
  const workspaces=[{id:'workspace',worktreePath:'/worktree',verifications:[{id:'verify',status:'passed',exitCode:0,cleanupConfirmed:true,stdoutPath:'/stdout',stderrPath:'/stderr'},{id:'source',status:'failed',exitCode:1}]}];
  const view=taskView(task,workspaces);
  assert.equal(view.memberUsage.totalTokens,100); assert.equal(view.reviewerUsage.totalTokens,30);
  assert.equal(view.phase,'awaiting_integration'); assert.equal(view.verification.exitCode,0);
  assert.equal(view.integrationElapsedMs,1000); assert.equal(view.integrationVerification.status,'failed');
  assert.equal(view.captainReview,'pass'); assert.equal(view.evidence.patchPath,'/patch');
});

test('a member that broke the contract exposes what it actually returned', () => {
  // runtime.js records validationFailure with the raw structured result; without surfacing it a schema
  // mismatch left the captain with only "检查成员的原始错误" and no way to see what the member sent.
  const task = { id:'t', objective:'audit', status:'failed', mode:'read-only', dependencies:[], error:'Result must address every acceptance criterion in the original order.',
    failure:{ code:'member_failed', phase:'member', nextAction:'检查成员的原始错误与退出记录；明确新证据后再重试。' },
    attempts:[{ id:'a', status:'failed', startedAt:'2026-10-13T00:00:00Z', endedAt:'2026-10-13T00:00:01Z', phase:'failed',
      selection:{ model:'m', effort:'high' },
      validationFailure:{ message:'Result must address every acceptance criterion in the original order.', resultExcerpt:'{"summary":"wrong shape","criteria":[]}', truncated:false } }] };
  const view = taskView(task);
  assert.equal(view.validationFailure.message, 'Result must address every acceptance criterion in the original order.');
  assert.match(view.validationFailure.resultExcerpt, /wrong shape/);
  const receipt = toolFeedback('teams_status', view);
  assert.match(receipt, /成员返回的结构不合合同/);
  assert.match(receipt, /wrong shape/);

  // Long member output stays bounded in the compact view.
  const long = taskView({ ...task, attempts:[{ ...task.attempts[0], validationFailure:{ message:'x', resultExcerpt:'y'.repeat(9000), truncated:true } }] });
  assert.equal(long.validationFailure.resultExcerpt.length, 2000);
  assert.equal(long.validationFailure.truncated, true);
  // A task with no such failure keeps the field null rather than inventing one.
  assert.equal(taskView({ id:'ok', objective:'o', status:'succeeded', mode:'read-only', dependencies:[], attempts:[] }).validationFailure, null);
});

test('HTML escapes repository-derived content, has no external requests and labels snapshots', () => {
  const task = {id:'x', objective:'<img src=x onerror=alert(1)>',status:'failed',mode:'read-only',dependencies:[],error:'</script><script>alert(2)</script>',result:{summary:'<b>untrusted</b>',blockers:[]},attempts:[]};
  const value=overview({tasks:[task],workspaces:[],owner:null,stateExists:true});
  const html=renderHtml(value);
  assert.ok(!html.includes('<img src=x')); assert.ok(!html.includes('<script>alert(2)'));
  assert.match(html,/&lt;img/); assert.match(html,/connect-src 'none'/);
  assert.match(html,/id="search"/); assert.match(html,/<details>/);
  assert.match(renderText(value),/运行时版本：未知/);
});

test('markPhase closes the previous phase and does not repeat identical transitions', () => {
  const attempt={}; markPhase(attempt,'member','2026-10-12T00:00:00Z'); markPhase(attempt,'member');
  markPhase(attempt,'verification','2026-10-12T00:00:01Z');
  assert.equal(attempt.phases.length,2); assert.equal(attempt.phases[0].endedAt,'2026-10-12T00:00:01Z');
});


test('legacy integrating records cannot invent an applying phase from task status', () => {
  for (const integration of [{status:'verifying'}, {status:'applying'}, undefined]) {
    const view = taskView({id:'legacy',objective:'legacy integration',status:'integrating',mode:'workspace-write',dependencies:[],attempts:[{id:'attempt',integration}]});
    assert.equal(view.phase,'unknown');
    assert.equal(view.phaseLabel,'阶段未知');
    assert.equal(view.status,'integrating');
  }
});


test('terminal legacy durations stay unknown without a recorded end time', () => {
  for (const status of ['failed','cancelled','interrupted','integration_failed','awaiting_review']) {
    const task={id:'old',objective:'old terminal',status,mode:'workspace-write',dependencies:[],attempts:[{id:'a',startedAt:'2026-10-12T00:00:00Z',integration:{startedAt:'2026-10-12T00:00:00Z'}}]};
    for (const at of ['2026-10-12T00:00:10Z','2026-10-12T00:01:00Z']) {
      const view=taskView(task,[],at);
      assert.equal(view.elapsedMs,null);assert.equal(view.integrationElapsedMs,null);
    }
  }
});

test('missing owner warns about stale activity without recovering or suggesting duplicate execution', () => {
  const make=(id,status)=>({id,status,objective:id,mode:'workspace-write',dependencies:[],attempts:[{id:'a',startedAt:'2026-10-12T00:00:00Z',integration:{startedAt:'2026-10-12T00:00:00Z'}}]});
  const tasks=[make('running','running'),make('integrating','integrating')];
  for(const owner of [null,{processAlive:false}]) {
    const report=overview({tasks,workspaces:[],owner,stateExists:true});
    assert.equal(report.counts.running,2);assert.match(report.warning,/进度需确认/);
    for(const task of report.tasks) {assert.equal(task.elapsedMs,null);assert.equal(task.integrationElapsedMs,null);assert.match(task.nextAction,/勿重复启动/)}
    assert.match(renderText(report),/需检查：/);assert.match(renderHtml(report),/进度需确认/);
  }
  const active=overview({tasks,workspaces:[],owner:{processAlive:true},stateExists:true},{at:'2026-10-12T00:00:10Z'});
  assert.equal(active.warning,null);assert.equal(active.tasks[0].elapsedMs,10000);
  assert.equal(active.tasks[1].integrationElapsedMs,10000);
  assert.deepEqual(tasks.map(task=>task.status),['running','integrating']);
});

test('recovery preserves execution endpoints and records observation separately from unknown stop times', t => {
  const f = fixture(t), store = new TaskStore(f.path);
  const startedAt = '2026-10-12T00:00:00.000Z', endedAt = '2026-10-12T00:01:00.000Z';
  const observedAt = '2026-10-12T02:00:00.000Z';
  for (const status of ['running', 'integrating']) {
    for (const knownEnd of [false, true]) {
      const phase = status === 'running' ? 'member' : 'integration_verification';
      store.save({ id: `${status}-${knownEnd}`, objective: 'recovery fixture', status, dependencies: [], attempts: [{
        id: 'a', status, startedAt, ...(knownEnd ? { endedAt } : {}), phase,
        phases: [{ phase: 'preparing', startedAt, endedAt }, { phase, startedAt: endedAt }],
        ...(status === 'integrating' ? { integration: { status: 'verifying', startedAt: endedAt } } : {}),
      }] }, 'fixture');
    }
  }
  // Two recovery shapes: a verification that never recorded a child (the case that used to lock the
  // workspace forever) and one whose recorded child group is already gone.
  store.saveWorkspace({ id: 'w', status: 'ready', verifications: [
    { id: 'v', status: 'running', startedAt },
    { id: 'v-exited', status: 'running', startedAt, childPid: 2, cleanupConfirmed: false },
  ] }, 'fixture');
  store.close();
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(observedAt) });
  const recovered = new TaskStore(f.path);
  try {
    for (const task of recovered.list()) {
      const attempt = task.attempts[0], knownEnd = task.id.endsWith('-true');
      const view = taskView(task);
      assert.equal(view.elapsedMs, knownEnd ? 60000 : null);
      assert.equal(attempt.endedAt, knownEnd ? endedAt : undefined);
      assert.equal(attempt.recoveryObservedAt, observedAt);
      assert.equal(attempt.phase, task.status);
      assert.equal(attempt.phases[0].endedAt, endedAt);
      assert.equal(attempt.phases[1].endedAt, undefined);
      assert.equal(attempt.phases[1].interrupted, true);
      assert.deepEqual(attempt.phases[2], { phase: task.status, observedAt });
      assert.equal(view.integrationElapsedMs, null);
      if (attempt.integration) {
        assert.equal(attempt.integration.endedAt, undefined);
        assert.equal(attempt.integration.recoveryObservedAt, observedAt);
        assert.equal(attempt.integration.status, 'recovery_required');
      }
    }
    const checks = recovered.getWorkspace('w').verifications;
    for (const check of checks) {
      assert.equal(check.status, 'interrupted');
      assert.equal(check.endedAt, undefined);
      assert.equal(check.recoveryObservedAt, observedAt);
      // A check that never recorded a childPid has no process group left to confirm; leaving it false
      // permanently locked the workspace behind an unactionable "inspect the process group" error.
      assert.equal(check.cleanupConfirmed, true);
    }
    const html = renderHtml(overview(readSnapshot(f.root)));
    assert.match(html, /恢复观察：2026-10-12T02:00:00.000Z/);
    assert.match(html, /中断，结束时间未知/);
  } finally { recovered.close(); }
  const reopened = new TaskStore(f.path);
  try { assert.equal(reopened.get('integrating-true').attempts[0].phases.length, 3); }
  finally { reopened.close(); }
});

test('recovery still refuses a verification whose recorded child is alive', async t => {
  const { spawn } = await import('node:child_process');
  const f = fixture(t), store = new TaskStore(f.path);
  // processAlive(pid, true) probes the process GROUP, so the fixture needs a real detached leader.
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 20000)'], { detached: true, stdio: 'ignore' });
  t.after(() => { try { process.kill(child.pid, 'SIGKILL'); } catch { /* already gone */ } });
  await delay(200);
  store.saveWorkspace({ id: 'w', status: 'ready', verifications: [
    { id: 'v-live', status: 'running', startedAt: new Date().toISOString(), childPid: child.pid, cleanupConfirmed: false },
  ] }, 'fixture');
  store.close();
  // The fix must not weaken the real protection: a live recorded process group still blocks recovery.
  assert.throws(() => new TaskStore(f.path), /may have a live process group/);
});

test('tool receipts describe recorded facts for every tool shape without inventing progress', () => {
  const pending = { id: 'abc12345-6789', objective: 'Inspect config', title: '检查配置', status: 'pending', mode: 'read-only', attemptCount: 0, attempts: [] };
  const review = toolFeedback('teams_status', pending);
  assert.match(review, /Agent Teams · 等待启动 · 检查配置 \[abc12345\]/);
  assert.match(review, /合同已创建；尚未启动成员。/);
  assert.match(review, /下一步：主 Agent · 明确任务合同后启动/);

  // A compact taskView carries a reduced `attempts` summary, not the raw attempt record.
  const view = taskView({ ...pending, dependencies: [] });
  assert.ok(Array.isArray(view.attempts));
  const rawAttemptKeys = ['threadId', 'turnId', 'childPid', 'usage', 'candidate', 'workspaceInputDigest', 'modelConfirmation', 'machineReview'];
  const full = taskView({ id: 'ghi11223-4567', objective: 'Audit source', status: 'awaiting_review', mode: 'read-only', dependencies: [],
    attempts: [{ id: 'attempt-1', status: 'succeeded', phase: 'awaiting_review', selection: { model: 'm', effort: 'high', profile: 'expert' }, actualModel: 'm',
      threadId: 'thread-secret', turnId: 'turn-secret', childPid: 4242, usage: { total: { totalTokens: 9 } }, candidate: { patchPath: '/patch' },
      modelConfirmation: { source: 'mcp-elicitation' }, result: { summary: 'done' } }] });
  for (const key of rawAttemptKeys) assert.ok(!(key in full.attempts[0]), `attempts[0] must not expose ${key}`);
  assert.equal(full.attempts[0].model, 'm'); assert.equal(full.attempts[0].effort, 'high');
  const fromView = toolFeedback('teams_wait', view);
  assert.match(fromView, /等待启动 · 检查配置/);
  assert.doesNotMatch(fromView, /undefined/);
  // The reduced summary must stay usable for receipts and must not leak raw attempt fields.
  const fromFull = toolFeedback('teams_status', full);
  assert.match(fromFull, /待验收|等待队长复核/);
  assert.match(fromFull, /成员：m \/ high/);
  assert.doesNotMatch(fromFull, /thread-secret|4242|patch/);

  // A submitted member states that verification is still pending instead of implying success.
  const submitted = toolFeedback('teams_status', taskView({ id: 'def67890-1234', objective: 'Audit source', status: 'awaiting_review', mode: 'read-only', attemptCount: 1,
    attempts: [{ id: 'attempt-1', status: 'succeeded', selection: { model: 'm', profile: 'expert' }, result: { summary: 'done', blockers: [] } }] }));
  assert.match(submitted, /成员已提交，尚未验收/);
  assert.match(submitted, /无需额外等待用户批准/);

  const list = toolFeedback('teams_status', [{ taskId: 'abc12345-6789', status: 'pending', title: '检查配置' }]);
  assert.match(list, /共 1 个任务/);
  assert.match(list, /\[abc12345\] 等待启动 · 检查配置/);
  assert.match(toolFeedback('teams_status', []), /尚无任务记录/);

  const started = toolFeedback('teams_start', { taskId: 'abc12345-6789', title: '检查配置', kind: 'implementation', selection: { model: 'm', effort: 'high' },
    reviewerSelection: { model: 'r', effort: 'high' }, confirmationScope: 'workspace', target: { root: '/repo' } });
  assert.match(started, /Agent Teams 已启动 · 检查配置 \[abc12345\]/);
  assert.match(started, /角色：实现成员 · m \/ high/);
  assert.match(started, /写任务后续独立审查：r \/ high/);
  assert.match(started, /用户已选择记住此工作区/);

  const models = toolFeedback('teams_models', { status: 'confirm', confirmationRequired: true, selection: null });
  assert.match(models, /等待模型确认/);
  assert.match(models, /成员模型和推理强度尚未确认。/);

  assert.match(toolFeedback('teams_integrate', { taskId: 'abc12345-6789' }), /已请求集成 \[abc12345\]/);
  assert.match(toolFeedback('teams_review', { some: 'other' }), /未启动新成员/);
});
