import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMcpServer } from '../src/mcp.js';
import { WorkspaceRouter } from '../src/workspace-router.js';
import { TaskRuntime } from '../src/runtime.js';
import { TaskStore } from '../src/store.js';
import { contract, report } from './helpers.js';

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

async function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'teams-mcp-routing-')));
  const a = join(root, 'project A'), b = join(root, '项目 B');
  mkdirSync(a); mkdirSync(b);
  const profiles = new Map([[a, { model: 'model-a', effort: 'high' }], [b, { model: 'model-b', effort: 'high' }]]);
  const runtimeCreations = [], executions = [], sessions = [];
  const discoveryHolds = new Map();
  const connect = async (handler = async () => ({ action: 'cancel' })) => {
    const router = new WorkspaceRouter({ maxConcurrency: 2, taskTimeoutMs: 30000, profiles: { expert: profiles.get(a) } }, {
      createRuntime: config => {
        runtimeCreations.push(config.workspace);
        const backend = { run: async request => {
          executions.push({ workspace: config.workspace, model: request.selection.model });
          return { result: structuredClone(report), actualModel: request.selection.model };
        } };
        return new TaskRuntime(new TaskStore(join(config.workspace, '.codex-teams', 'state.sqlite')), backend, config, { requireModelConfirmation: true });
      },
      discoverModels: async workspace => {
        const hold = discoveryHolds.get(workspace);
        if (hold) { discoveryHolds.delete(workspace); hold.entered.resolve(); await hold.release.promise; }
        const profile = profiles.get(workspace);
        return { models: [{ model: profile.model, efforts: [profile.effort] }], inferenceStarted: false };
      },
    });
    let closed = false;
    const server = createMcpServer(() => { throw new Error('Legacy runtime must never be acquired by routed tools'); }, { route: args => router.resolve(args) });
    const client = new Client({ name: 'multi-project-tests', version: '1' }, { capabilities: { elicitation: { form: {} } } });
    client.setRequestHandler('elicitation/create', handler);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport); await client.connect(clientTransport);
    const close = async () => {
      if (closed) return;
      closed = true;
      try { await client.close(); await server.close(); }
      finally { await router.close(); }
    };
    sessions.push({ close });
    const call = async (name, args = {}) => {
      const result = await client.callTool({ name, arguments: args });
      return { isError: Boolean(result.isError), value: result.isError ? result.content[0].text : JSON.parse(result.content[0].text) };
    };
    return { client, router, call, close };
  };
  t.after(async () => { try { for (const session of sessions) await session.close(); } finally { rmSync(root, { recursive: true, force: true }); } });
  const accept = (workspace, remember = true) => ({ action: 'accept', content: { expert: JSON.stringify(profiles.get(workspace)), simple: 'none', confirm: true, remember } });
  const workspaceFor = request => {
    const workspace = [a, b].find(path => request.params.message.includes(path));
    assert.ok(workspace, 'form must name its own project');
    assert.deepEqual(request.params.requestedSchema.properties.expert.enum, [JSON.stringify(profiles.get(workspace))]);
    return workspace;
  };
  return { a, b, profiles, connect, accept, workspaceFor, runtimeCreations, executions, discoveryHolds };
}

test('one SDK connection routes two projects without owner acquisition during inventory, models or status', { timeout: 15000 }, async t => {
  const f = await fixture(t), s = await f.connect();
  const tools = (await s.client.listTools()).tools;
  assert.equal(tools.length, 8);
  for (const tool of tools) {
    assert.match(tool.description, /current chat cwd automatically/);
    assert.match(tool.description, /After reconnecting/);
    if (tool.name === 'teams_create') assert.ok(tool.inputSchema.required.includes('expectedWorkspace'));
    else {
      assert.ok(tool.inputSchema.properties.workspace);
      assert.ok(!tool.inputSchema.required?.includes('workspace'));
      const invalid = await s.call(tool.name, { workspace: 'relative/path', ...(tool.name === 'teams_models' || tool.name === 'teams_status' ? {} : { taskId: 'unused', attemptId: 'unused' }) });
      assert.equal(invalid.isError, true);
    }
  }
  assert.equal((await s.call('teams_models')).isError, true, 'first dynamic call must carry the chat workspace');
  assert.equal((await s.call('teams_status')).isError, true);
  const first = await s.call('teams_models', { workspace: f.a });
  assert.equal(first.value.workspace, f.a);
  assert.equal((await s.call('teams_status', { overview: true })).value.counts.total, 0, 'one known project may be inferred');
  const second = await s.call('teams_models', { workspace: f.b });
  assert.equal(second.value.workspace, f.b);
  assert.equal((await s.call('teams_models')).isError, true);
  assert.equal((await s.call('teams_status')).isError, true, 'multiple projects must not select the last used');
  for (const workspace of [f.a, f.b]) {
    const status = await s.call('teams_status', { workspace, overview: true });
    assert.equal(status.value.counts.total, 0);
    assert.equal(status.value.runtime, null);
    assert.equal(existsSync(join(workspace, '.codex-teams')), false);
  }
  assert.deepEqual(f.runtimeCreations, []);
  assert.deepEqual(f.executions, []);
});

test('model approvals, task ids, reviews and forget stay within their project on one connection', { timeout: 15000 }, async t => {
  const f = await fixture(t), s = await f.connect(async request => f.accept(f.workspaceFor(request)));
  const aTask = (await s.call('teams_create', { ...contract, expectedWorkspace: f.a })).value;
  const bTask = (await s.call('teams_create', { ...contract, expectedWorkspace: f.b })).value;
  assert.equal(aTask.target.root, f.a); assert.equal(bTask.target.root, f.b);
  await s.call('teams_models', { workspace: f.a, confirm: true });
  assert.equal((await s.call('teams_models', { workspace: f.b })).value.confirmationRequired, true);
  assert.equal((await s.call('teams_start', { taskId: bTask.id })).isError, true, 'project A approval cannot authorize B');
  for (const [name, args] of [
    ['teams_status', {}], ['teams_start', {}], ['teams_wait', { timeoutMs: 0 }], ['teams_review', { attemptId: 'unused', verdict: 'pass', evidence: [{ criterion: contract.acceptance[0], evidence: 'unused' }] }], ['teams_integrate', { attemptId: 'unused' }], ['teams_cancel', {}],
  ]) assert.equal((await s.call(name, { ...args, workspace: f.b, taskId: aTask.id })).isError, true, `${name} must reject a task in the wrong project`);
  assert.equal((await s.call('teams_status', { workspace: f.a })).value[0].taskId, aTask.id);
  assert.equal((await s.call('teams_status', { workspace: f.b })).value[0].taskId, bTask.id);
  await s.call('teams_models', { workspace: f.b, confirm: true });
  for (const task of [aTask, bTask]) {
    assert.equal((await s.call('teams_start', { taskId: task.id })).isError, false);
    const ready = await s.call('teams_wait', { taskId: task.id, timeoutMs: 5000, verbose: true });
    assert.equal(ready.value.status, 'awaiting_review');
    assert.equal(ready.value.attempts[0].selection.model, f.profiles.get(task.target.root).model);
    const reviewed = await s.call('teams_review', { workspace: task.target.root, taskId: task.id, attemptId: ready.value.attempts[0].id, verdict: 'pass', evidence: [{ criterion: contract.acceptance[0], evidence: 'Captain checked the project evidence.' }] });
    assert.equal(reviewed.isError, false, 'routing workspace must be stripped before strict runtime review parsing');
    assert.equal(reviewed.value.status, 'succeeded');
  }
  assert.deepEqual(f.executions, [{ workspace: f.a, model: 'model-a' }, { workspace: f.b, model: 'model-b' }]);
  assert.equal((await s.call('teams_models', { workspace: f.a, forget: true })).value.status, 'forgotten');
  assert.equal((await s.call('teams_models', { workspace: f.a })).value.confirmationRequired, true);
  assert.equal((await s.call('teams_models', { workspace: f.b })).value.confirmationRequired, false);
  const cancelled = await s.call('teams_cancel', { taskId: bTask.id });
  assert.equal(cancelled.value.status, 'succeeded');
});

test('parallel forms are isolated and an in-flight discovery cannot race a same-project confirmation', { timeout: 15000 }, async t => {
  const f = await fixture(t), aOpened = deferred(), aAnswer = deferred();
  const s = await f.connect(async request => {
    const workspace = f.workspaceFor(request);
    if (workspace === f.a) { aOpened.resolve(); return aAnswer.promise; }
    return f.accept(workspace);
  });
  const aTask = (await s.call('teams_create', { ...contract, expectedWorkspace: f.a })).value;
  const bTask = (await s.call('teams_create', { ...contract, expectedWorkspace: f.b })).value;
  const aConfirm = s.call('teams_models', { workspace: f.a, confirm: true });
  await aOpened.promise;
  assert.equal((await s.call('teams_models', { workspace: f.a, confirm: true })).isError, true);
  assert.equal((await s.call('teams_models', { workspace: f.a, forget: true })).isError, true);
  assert.equal((await s.call('teams_start', { taskId: aTask.id })).isError, true);
  assert.equal((await s.call('teams_models', { workspace: f.b, confirm: true })).value.status, 'confirmed');
  assert.equal((await s.call('teams_start', { taskId: bTask.id })).isError, false);
  assert.equal((await s.call('teams_wait', { taskId: bTask.id, timeoutMs: 5000 })).value.status, 'awaiting_review');
  aAnswer.resolve(f.accept(f.a));
  assert.equal((await aConfirm).value.selection.profiles.expert.model, 'model-a');

  const entered = deferred(), release = deferred(), changeOpened = deferred(), changeAnswer = deferred();
  f.discoveryHolds.set(f.a, { entered, release });
  s.client.setRequestHandler('elicitation/create', async request => { assert.equal(f.workspaceFor(request), f.a); changeOpened.resolve(); return changeAnswer.promise; });
  const starting = s.call('teams_start', { taskId: aTask.id });
  await entered.promise;
  const changing = s.call('teams_models', { workspace: f.a, confirm: true });
  await changeOpened.promise;
  release.resolve();
  assert.match((await starting).value, /confirmation to finish/);
  assert.equal((await s.call('teams_models', { workspace: f.b })).value.selection.profiles.expert.model, 'model-b');
  changeAnswer.resolve({ action: 'cancel' });
  const cancelled = await changing;
  assert.equal(cancelled.value.selectionChanged, false);
  assert.equal(cancelled.value.selection.profiles.expert.model, 'model-a');
  assert.equal((await s.call('teams_status', { taskId: aTask.id, verbose: true })).value.attempts.length, 0);
});

test('reconnect requires explicit context and restores remembered choices only for that workspace', { timeout: 15000 }, async t => {
  const f = await fixture(t), first = await f.connect(async request => {
    const workspace = f.workspaceFor(request);
    return f.accept(workspace, workspace === f.a);
  });
  const aTask = (await first.call('teams_create', { ...contract, expectedWorkspace: f.a })).value;
  const bTask = (await first.call('teams_create', { ...contract, expectedWorkspace: f.b })).value;
  await first.call('teams_models', { workspace: f.a, confirm: true });
  await first.call('teams_models', { workspace: f.b, confirm: true });
  await first.close();
  const second = await f.connect();
  assert.equal((await second.call('teams_status', { taskId: aTask.id })).isError, true, 'new connection has no remembered last target or global task index');
  assert.equal((await second.call('teams_start', { taskId: bTask.id })).isError, true);
  const beforeRestore = f.runtimeCreations.length;
  const saved = await second.call('teams_models', { workspace: f.a });
  assert.equal(saved.value.confirmationRequired, false);
  assert.equal(saved.value.selection.profiles.expert.model, 'model-a');
  assert.equal((await second.call('teams_models', { workspace: f.b })).value.confirmationRequired, true);
  assert.equal(f.runtimeCreations.length, beforeRestore, 'saved preference discovery stays read-only');
  assert.equal((await second.call('teams_status', { workspace: f.a, taskId: aTask.id })).value.status, 'pending');
  assert.equal((await second.call('teams_start', { taskId: aTask.id })).isError, false);
  assert.equal((await second.call('teams_wait', { taskId: aTask.id, timeoutMs: 5000 })).value.status, 'awaiting_review');
  assert.equal((await second.call('teams_start', { taskId: bTask.id })).isError, true);
  assert.equal((await second.call('teams_status', { workspace: f.b, taskId: bTask.id })).value.status, 'pending');
});

test('duplicate task ids require an explicit project and workspace plus taskId identifies its own record', { timeout: 15000 }, async t => {
  const f = await fixture(t), s = await f.connect();
  const aTask = (await s.call('teams_create', { ...contract, expectedWorkspace: f.a })).value;
  const bTask = (await s.call('teams_create', { ...contract, expectedWorkspace: f.b })).value;
  s.router.resolve({ workspace: f.b }).getRuntime().store.save({ ...bTask, id: aTask.id }, 'controlled-duplicate-fixture');
  const rejected = await s.call('teams_cancel', { taskId: aTask.id });
  assert.equal(rejected.isError, true);
  assert.match(rejected.value, /ambiguous|duplicate/i);
  for (const workspace of [f.a, f.b]) {
    const identified = await s.call('teams_status', { workspace, taskId: aTask.id, verbose: true });
    assert.equal(identified.isError, false);
    assert.equal(identified.value.target.root, workspace);
  }
  assert.deepEqual(f.executions, []);
  assert.equal(s.router.resolve({ workspace: f.a }).getRuntime().status(aTask.id).status, 'pending');
  assert.equal(s.router.resolve({ workspace: f.b }).getRuntime().status(aTask.id).status, 'pending');
});

test('stdio serve routes without a fallback runtime and closeAll releases every project owner', { timeout: 15000 }, async t => {
  const f = await fixture(t), evidence = join(f.a, 'close-evidence.json');
  const moduleUrl = relative => new URL(relative, import.meta.url).href;
  const code = `
    import { writeFileSync } from 'node:fs';
    import { serve } from ${JSON.stringify(moduleUrl('../src/mcp.js'))};
    import { WorkspaceRouter } from ${JSON.stringify(moduleUrl('../src/workspace-router.js'))};
    import { readSnapshot } from ${JSON.stringify(moduleUrl('../src/status.js'))};
    const router = new WorkspaceRouter({ maxConcurrency: 2, taskTimeoutMs: 30000, profiles: { expert: { model: 'not-used' } } });
    await serve(() => { throw new Error('Fallback factory must not be used'); }, {
      route: args => router.resolve(args),
      closeAll: async () => {
        await router.close();
        writeFileSync(${JSON.stringify(evidence)}, JSON.stringify([${JSON.stringify(f.a)}, ${JSON.stringify(f.b)}].map(workspace => ({ workspace, owner: readSnapshot(workspace).owner }))));
      },
    });
  `;
  const client = new Client({ name: 'routed-stdio-lifecycle-tests', version: '1' });
  t.after(() => client.close());
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ['--input-type=module', '-e', code], stderr: 'pipe' }));
  for (const workspace of [f.a, f.b]) {
    const created = await client.callTool({ name: 'teams_create', arguments: { ...contract, expectedWorkspace: workspace } });
    assert.ok(!created.isError, created.content[0].text);
    assert.equal(JSON.parse(created.content[0].text).target.root, workspace);
  }
  await client.close();
  const deadline = Date.now() + 3000;
  while (!existsSync(evidence) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(existsSync(evidence), 'serve must finish closeAll on SDK client disconnect');
  assert.deepEqual(JSON.parse(readFileSync(evidence, 'utf8')), [{ workspace: f.a, owner: null }, { workspace: f.b, owner: null }]);
});
