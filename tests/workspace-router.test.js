import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceRouter } from '../src/workspace-router.js';
import { TaskStore } from '../src/store.js';
import { TaskRuntime } from '../src/runtime.js';
import { readSnapshot } from '../src/status.js';
import { config, contract, tick } from './helpers.js';

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'teams-router-')));
  const projects = ['project a', '项目 b'].map(name => {
    const path = join(root, name);
    mkdirSync(path);
    execFileSync('git', ['init', '-q', path]);
    return path;
  });
  const routers = [];
  t.after(async () => {
    await Promise.allSettled(routers.map(router => router.close()));
    rmSync(root, { recursive: true, force: true });
  });
  const { workspace, ...dynamicConfig } = config;
  const router = (options, fixed) => {
    const value = new WorkspaceRouter({ ...dynamicConfig, taskTimeoutMs: 30000, ...(fixed ? { workspace: fixed } : {}) }, options);
    routers.push(value);
    return value;
  };
  return { root, projects, router };
}

test('dynamic router never guesses ambient cache cwd and requires disambiguation', async t => {
  const f = fixture(t), router = f.router();
  assert.throws(() => router.resolve(), /current chat cwd.*cache cwd/);
  assert.throws(() => router.resolve({ workspace: '.' }), /absolute workspace/);
  const a = router.resolve({ workspace: f.projects[0] });
  assert.equal(router.resolve(), a);
  const b = router.resolve({ workspace: f.projects[1] });
  assert.notEqual(a, b);
  assert.throws(() => router.resolve(), /Multiple workspaces/);
  assert.equal(a.observe().stateExists, false);
  assert.equal(b.observe().stateExists, false);
  await router.close();
  for (const path of f.projects) assert.equal(existsSync(join(path, '.codex-teams')), false);
  assert.throws(() => router.resolve({ workspace: f.projects[0] }), /closing/);
  assert.throws(() => a.getRuntime(), /closing/);
});

test('symlink aliases reuse a scope and all entry points reject replaced directory identities', async t => {
  const f = fixture(t), router = f.router(), [a] = f.projects;
  const alias = join(f.root, 'alias');
  symlinkSync(a, alias);
  const scope = router.resolve({ workspace: a });
  assert.equal(router.resolve({ workspace: alias }), scope);
  renameSync(a, a + '-old'); mkdirSync(a);
  assert.throws(() => router.resolve({ workspace: a }), /identity changed/);
  assert.throws(() => router.resolve(), /identity changed/);
  assert.throws(() => scope.getRuntime(), /identity changed/);
  assert.throws(() => scope.observe(), /identity changed/);
  await assert.rejects(scope.discoverModels(), /identity changed/);
});

test('fixed legacy workspace rejects explicit different projects', t => {
  const f = fixture(t), router = f.router(undefined, f.projects[0]);
  assert.equal(router.resolve().workspace, f.projects[0]);
  assert.throws(() => router.resolve({ workspace: f.projects[1] }), /Target workspace mismatch/);
});

test('an explicit task project remains usable when an unrelated known directory is replaced', t => {
  const f = fixture(t), router = f.router(), [a, b] = f.projects;
  router.resolve({ workspace: a });
  const scope = router.resolve({ workspace: b });
  const task = scope.getRuntime().create(contract);
  renameSync(a, a + '-old'); mkdirSync(a);
  assert.throws(() => router.resolve({ taskId: task.id }), /identity changed/);
  assert.equal(router.resolve({ workspace: b, taskId: task.id }), scope);
});

test('task ids route from fresh snapshots, isolate dependencies and never acquire another owner', t => {
  const f = fixture(t), router = f.router(), [a, b] = f.projects;
  const sa = router.resolve({ workspace: a }), sb = router.resolve({ workspace: b });
  const ra = sa.getRuntime(), rb = sb.getRuntime();
  assert.equal(ra.requireModelConfirmation, true);
  const ta = ra.create(contract), tb = rb.create(contract);
  assert.equal(router.resolve({ taskId: ta.id }), sa);
  assert.equal(router.resolve({ taskId: tb.id }), sb);
  assert.throws(() => router.resolve({ workspace: b, taskId: ta.id }), /belongs to another workspace/);
  assert.throws(() => rb.create({ ...contract, dependencies: [ta.id] }), /Unknown task/);
  assert.throws(() => router.resolve({ taskId: 'unknown' }), /explicit workspace/);
  const competitor = f.router();
  const competingScope = competitor.resolve({ workspace: a, taskId: ta.id });
  assert.equal(competingScope.observe(ta.id).tasks[0].id, ta.id);
  assert.throws(() => competingScope.getRuntime(), /Another runtime owns/);
  // A late task is found without an alias/id cache being refreshed manually.
  const late = ra.create(contract);
  assert.equal(router.resolve({ taskId: late.id }), sa);
});

test('discovery probes selected project without creating state and guards identity after async discovery', async t => {
  const f = fixture(t), calls = [];
  const router = f.router({ discoverModels: async workspace => {
    calls.push(workspace); return { workspace: '/wrong-provider-workspace', models: [] };
  } });
  for (const workspace of f.projects) {
    const catalog = await router.resolve({ workspace }).discoverModels();
    assert.equal(catalog.workspace, workspace);
    assert.equal(existsSync(join(workspace, '.codex-teams')), false);
  }
  assert.deepEqual(calls, f.projects);
  let release;
  const lateRouter = f.router({ discoverModels: () => new Promise(resolve => { release = resolve; }) });
  const pending = lateRouter.resolve({ workspace: f.projects[0] }).discoverModels();
  renameSync(f.projects[0], f.projects[0] + '-old'); mkdirSync(f.projects[0]);
  release({ models: [] });
  await assert.rejects(pending, /identity changed/);
});

test('default discovery uses configured Codex in the selected workspace without inference', async t => {
  const f = fixture(t), binary = join(f.root, 'fake codex');
  writeFileSync(binary, `#!/usr/bin/env node\nprocess.argv[2]='normal';await import(${JSON.stringify(new URL('./fixtures/fake-app-server.js', import.meta.url).href)});\n`, { mode: 0o755 });
  const router = new WorkspaceRouter({ ...config, workspace: undefined, codexBin: binary });
  t.after(() => router.close());
  const catalog = await router.resolve({ workspace: f.projects[0] }).discoverModels();
  assert.equal(catalog.workspace, f.projects[0]);
  assert.equal(catalog.server.userAgent, 'fake-test-server');
  assert.equal(catalog.inferenceStarted, false);
  assert.equal(existsSync(join(f.projects[0], '.codex-teams')), false);
});

test('closing a router rejects a discovery completion without acquiring state', async t => {
  const f = fixture(t);
  let release;
  const router = f.router({ discoverModels: () => new Promise(resolve => { release = resolve; }) });
  const scope = router.resolve({ workspace: f.projects[0] });
  const pending = scope.discoverModels();
  await router.close();
  release({ models: [] });
  await assert.rejects(pending, /closing/);
  assert.equal(existsSync(join(f.projects[0], '.codex-teams')), false);
});

test('reconnect requires explicit workspace, observes interruption without replay, then recovers lazily', async t => {
  const f = fixture(t), [a] = f.projects, router = f.router();
  const runtime = router.resolve({ workspace: a }).getRuntime();
  const task = runtime.create(contract);
  task.status = 'running';
  task.attempts.push({ id: 'old-attempt', status: 'running', startedAt: new Date().toISOString() });
  runtime.store.save(task, 'fixture-interruption');
  await router.close();
  const reconnect = f.router();
  assert.throws(() => reconnect.resolve({ taskId: task.id }), /explicit workspace/);
  const scope = reconnect.resolve({ workspace: a, taskId: task.id });
  assert.equal(scope.observe(task.id).tasks[0].status, 'running', 'observation must not recover or replay');
  assert.equal(scope.observe().owner, null);
  const recovered = scope.getRuntime().status(task.id);
  assert.equal(recovered.status, 'interrupted');
  assert.equal(recovered.attempts.length, 1);
  assert.equal(scope.getRuntime().active.size, 0);
});

test('shutdown cancels active runtimes, waits for exit, closes all owners and aggregates failures', async t => {
  const f = fixture(t), cancelled = [];
  const router = f.router({ createRuntime: scopeConfig => new TaskRuntime(
    new TaskStore(join(scopeConfig.workspace, '.codex-teams/state.sqlite')),
    { run: ({ signal }) => new Promise((resolve, reject) => {
      const abort = () => { cancelled.push(scopeConfig.workspace); reject(signal.reason); };
      if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
    }) }, scopeConfig, { requireModelConfirmation: true }),
  });
  const tasks = f.projects.map(workspace => {
    const runtime = router.resolve({ workspace }).getRuntime();
    runtime.confirmModels(config.profiles, 'mcp-elicitation');
    const task = runtime.create(contract); runtime.start(task.id); return task;
  });
  await tick();
  const close = router.close();
  assert.equal(router.close(), close);
  await close;
  assert.deepEqual(cancelled.sort(), [...f.projects].sort());
  f.projects.forEach((workspace, i) => {
    const snapshot = readSnapshot(workspace, tasks[i].id);
    assert.equal(snapshot.owner, null);
    assert.equal(snapshot.tasks[0].status, 'cancelled');
  });
  const closed = [];
  const broken = f.router({ createRuntime: scopeConfig => ({ close() {
    closed.push(scopeConfig.workspace); throw new Error(scopeConfig.workspace);
  } }) });
  f.projects.forEach(workspace => broken.resolve({ workspace }).getRuntime());
  await assert.rejects(broken.close(), error => error instanceof AggregateError && error.errors.length === 2);
  assert.deepEqual(closed.sort(), [...f.projects].sort());
});
