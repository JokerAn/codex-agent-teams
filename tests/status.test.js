import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { TaskStore } from '../src/store.js';
import { TaskRuntime } from '../src/runtime.js';
import { pluginIdentity, readSnapshot, overview, taskView, renderHtml, renderText, markPhase } from '../src/status.js';
import { config, contract, report } from './helpers.js';

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
  const runtime = new TaskRuntime(store, { run: () => new Promise(resolve => { complete = () => resolve({ result: report }); }) }, { ...config, workspace: f.root });
  const task = runtime.create(contract);
  runtime.start(task.id);
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
  runtime.start(task.id,{retry:true,reason:'fresh evidence'}); complete(); await runtime.wait(task.id);
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
