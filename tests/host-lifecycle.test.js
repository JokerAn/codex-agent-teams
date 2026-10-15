import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, realpathSync, existsSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { TaskStore } from '../src/store.js';
import { TaskRuntime } from '../src/runtime.js';
import { WorkspaceRouter } from '../src/workspace-router.js';
import { startHostLifecycle, lifecycleRequest } from '../src/host-lifecycle.js';
import { handleHostHook } from '../src/host-hook.js';
import { config, contract, report, tick } from './helpers.js';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { createMcpServer } from '../src/mcp.js';

const newSession = t => {
  const id = randomUUID();
  t.after(() => rmSync(join(tmpdir(), `teams-session-${createHash('sha256').update(id).digest('hex')}.jsonl`), { force: true }));
  return id;
};

test('hook dispatch requires explicit task workspace across projects; SDK schema agrees while queries stay taskId-only', async t => {
  const f = await fixture(t), a = realpathSync(f.root), b = join(a, 'project-b');
  mkdirSync(b);
  const scope = f.router.resolve({ workspace: b }), runtime = scope.getRuntime(), task = runtime.create(contract);
  f.lifecycle.publish(scope);
  const server = createMcpServer(undefined, { route: args => f.router.resolve(args), lifecycle: f.lifecycle });
  const client = new Client({ name: 'explicit-dispatch-target', version: '1' });
  t.after(async () => { await client.close(); await server.close(); });
  const [left, right] = InMemoryTransport.createLinkedPair(); await server.connect(left); await client.connect(right);
  const tools = (await client.listTools()).tools;
  for (const name of ['teams_start', 'teams_integrate']) {
    const tool = tools.find(tool => tool.name === name);
    assert(tool.inputSchema.required.includes('workspace'));
    assert.doesNotMatch(tool.description, /known in this connection can omit workspace/);
    const event = { hook_event_name: 'PreToolUse', session_id: newSession(t), turn_id: 'turn', cwd: a,
      tool_name: `mcp__codex_agent_teams__${name}`, tool_input: { taskId: task.id } };
    await assert.rejects(handleHostHook(event), /workspace is required/);
    assert((await client.callTool({ name, arguments: { taskId: task.id, ...(name === 'teams_integrate' ? { attemptId: 'unused' } : {}) } })).isError);
    await assert.rejects(handleHostHook({ ...event, tool_input: { taskId: task.id, workspace: a } }), /belongs to another workspace/);
    const hook = await handleHostHook({ ...event, tool_input: { taskId: task.id, workspace: b } });
    assert.equal(hook.hookSpecificOutput.permissionDecision, 'allow');
    assert.equal(f.lifecycle.claim(scope, task.id, hook.hookSpecificOutput.updatedInput.hostTicket).runtime, runtime);
  }
  const queried = await client.callTool({ name: 'teams_status', arguments: { taskId: task.id } });
  assert(!queried.isError); assert.equal(JSON.parse(queried.content[0].text).target.root, b);
  assert.equal(runtime.status(task.id).attempts.length, 0, 'schema and binding checks launch nothing');
});

async function fixture(t, retainRoot = false) {
  const root = mkdtempSync(join(tmpdir(), 'teams-host-test-'));
  const { workspace: unused, ...globalConfig } = config;
  const router = new WorkspaceRouter(globalConfig, { createRuntime: settings => new TaskRuntime(new TaskStore(join(settings.workspace, '.codex-teams/state.sqlite')), {
    run: ({ signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })),
  }, settings) });
  const lifecycle = await startHostLifecycle(args => router.resolve(args));
  t.after(async () => { await router.close(); await lifecycle.close(); if (!retainRoot) rmSync(root, { recursive: true, force: true }); });
  const scope = router.resolve({ workspace: root }), runtime = scope.getRuntime();
  lifecycle.publish(scope);
  const endpoint = JSON.parse(readFileSync(join(root, '.codex-teams/host-control.json'), 'utf8'));
  return { root, router, lifecycle, runtime, scope, endpoint };
}

test('real command-hook inputs bind the host turn; interrupt cancels only its work and blocks late starts', async t => {
  const f = await fixture(t), session = newSession(t);
  const a = f.runtime.create(contract), b = f.runtime.create(contract);
  let held;
  for (const [task, sessionId] of [[a, session], [b, newSession(t)]]) {
    const result = await handleHostHook({ hook_event_name: 'PreToolUse', session_id: sessionId, turn_id: 'turn-a', cwd: f.root,
      tool_name: 'mcp__codex-agent-teams__teams_start', tool_input: { taskId: task.id, workspace: f.root } });
    const binding = f.lifecycle.claim(f.scope, task.id, result.hookSpecificOutput.updatedInput.hostTicket);
    const receipt = f.runtime.start(task.id, { host: binding.host });
    f.lifecycle.started(binding, receipt.attemptId);
    if (task.id === a.id) held = binding;
  }
  await tick();
  assert.deepEqual(await handleHostHook({ hook_event_name: 'Interrupt', session_id: session, turn_id: 'turn-a', cwd: f.root }), {});
  assert.equal(f.runtime.status(a.id).status, 'cancelled');
  assert.equal(f.runtime.status(a.id).attempts[0].cleanupConfirmed, true);
  assert.equal(f.runtime.status(b.id).status, 'running');
  assert.throws(() => f.lifecycle.check(held), /interrupted/);
  await assert.rejects(lifecycleRequest(f.endpoint, { event: 'bind', sessionId: session, turnId: 'turn-a', workspace: f.root, taskId: a.id }), /interrupted/);
  const next = await lifecycleRequest(f.endpoint, { event: 'bind', sessionId: session, turnId: 'next', workspace: f.root, taskId: a.id });
  const binding = f.lifecycle.claim(f.scope, a.id, next.ticket);
  const retried = f.runtime.start(a.id, { retry: true, reason: 'new host turn', host: binding.host });
  f.lifecycle.started(binding, retried.attemptId);
  await tick();
  await lifecycleRequest(f.endpoint, { event: 'Interrupt', sessionId: session, turnId: 'turn-a' });
  assert.equal(f.runtime.status(a.id).status, 'running', 'late old-turn stop cannot cancel the retry');
  assert.throws(() => f.lifecycle.claim(f.scope, a.id, next.ticket), /already used/);
  await handleHostHook({ hook_event_name: 'SessionEnd', session_id: session });
});

test('cancellation tombstone precedes binding and async discovery; forged token and cross-turn rebinding fail', async t => {
  const f = await fixture(t), task = f.runtime.create(contract);
  const base = { sessionId: 's', turnId: 't', workspace: f.root, taskId: task.id };
  await assert.rejects(lifecycleRequest({ ...f.endpoint, token: 'forged' }, { ...base, event: 'bind' }), /capability/);
  assert.throws(() => f.lifecycle.claim(f.scope, task.id), /binding missing/);
  await lifecycleRequest(f.endpoint, { ...base, event: 'Interrupt' });
  await assert.rejects(lifecycleRequest(f.endpoint, { ...base, event: 'bind' }), /interrupted/);
  await lifecycleRequest(f.endpoint, { ...base, turnId: 'next', event: 'bind' });
  f.runtime.start(task.id); await tick();
  await assert.rejects(lifecycleRequest(f.endpoint, { ...base, sessionId: 'other', event: 'bind' }), /another active host turn/);
});

test('SessionEnd cancels all turns of one session and never another session; shutdown removes its endpoint', async t => {
  const f = await fixture(t);
  for (const turnId of ['one', 'two']) {
    const task = f.runtime.create(contract);
    const bound = await lifecycleRequest(f.endpoint, { event: 'bind', sessionId: 's', turnId, workspace: f.root, taskId: task.id });
    const binding = f.lifecycle.claim(f.scope, task.id, bound.ticket);
    const receipt = f.runtime.start(task.id);
    f.lifecycle.started(binding, receipt.attemptId);
  }
  await tick();
  const receipt = await lifecycleRequest(f.endpoint, { event: 'SessionEnd', sessionId: 's' });
  assert.equal(receipt.cancelled.length, 2); assert.equal(receipt.exitConfirmed, true);
  assert.equal(f.runtime.active.size, 0);
  assert(existsSync(f.endpoint.socket));
});

test('Interrupt during live model discovery refuses late start before any attempt is created', async t => {
  const f = await fixture(t), task = f.runtime.create(contract);
  let resolveCatalog, entered;
  const discoveryStarted = new Promise(resolve => { entered = resolve; });
  f.router.discoverModels = () => { entered(); return new Promise(resolve => { resolveCatalog = resolve; }); };
  const bound = await lifecycleRequest(f.endpoint, { event: 'bind', sessionId: 'race', turnId: 'turn', taskId: task.id, workspace: f.root });
  const server = createMcpServer(undefined, { route: args => f.router.resolve(args), lifecycle: f.lifecycle });
  const client = new Client({ name: 'lifecycle-race-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); });
  await server.connect(a); await client.connect(b);
  const dispatch = client.callTool({ name: 'teams_start', arguments: { workspace: f.root, taskId: task.id, hostTicket: bound.ticket,
    models: { expert: { model: 'strong-test-model', effort: 'high' } } } });
  await discoveryStarted;
  await lifecycleRequest(f.endpoint, { event: 'Interrupt', sessionId: 'race', turnId: 'turn' });
  resolveCatalog({ models: [{ model: 'strong-test-model', efforts: ['high'] }] });
  const result = await dispatch;
  assert.equal(result.isError, true); assert.match(result.content[0].text, /interrupted/);
  assert.equal(f.runtime.status(task.id).attempts.length, 0);
});

test('production stdio MCP requires command-hook ticket and confirms owned backend exit on Interrupt', { timeout: 30000 }, async t => {
  const root = mkdtempSync(join(tmpdir(), 'teams-hook-stdio-'));
  const binary = join(root, 'fake-codex'), configPath = join(root, 'config.json');
  writeFileSync(binary, `#!/usr/bin/env node\nprocess.argv[2]='hang';await import(${JSON.stringify(new URL('./fixtures/fake-app-server.js', import.meta.url).href)});\n`, { mode: 0o755 });
  writeFileSync(configPath, JSON.stringify({ codexBin: binary, profiles: { expert: { model: 'test-model', effort: 'high' } } }));
  const client = new Client({ name: 'hook-lifecycle-tests', version: '1' });
  t.after(async () => { await client.close(); rmSync(root, { recursive: true, force: true }); });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../src/cli.js', import.meta.url)), 'mcp', '--config', configPath, '--host-lifecycle'], stderr: 'pipe' }));
  const call = (name, args) => client.callTool({ name, arguments: args });
  const created = await call('teams_create', { expectedWorkspace: root, objective: 'Controlled hang', acceptance: ['No inference'] });
  assert(!created.isError, JSON.stringify(created));
  const taskId = JSON.parse(created.content[0].text).id;
  const args = { workspace: root, taskId, models: { expert: { model: 'test-model', effort: 'high' } } };
  assert.equal((await call('teams_start', args)).isError, true, 'missing hook must fail closed');
  const session = newSession(t);
  // Execute the same command-handler module with host-shaped stdin, using an
  // actual process rather than bypassing the production MCP/CLI wiring.
  const runHook = event => new Promise((resolve, reject) => {
    const child = execFile(process.execPath, [fileURLToPath(new URL('../src/host-hook.js', import.meta.url))], { timeout: 4000 }, (error, stdout) => error ? reject(error) : resolve(JSON.parse(stdout)));
    child.stdin.end(JSON.stringify(event));
  });
  const common = { session_id: session, turn_id: 'host-turn', cwd: root };
  const bound = await runHook({ ...common, hook_event_name: 'PreToolUse', tool_name: 'mcp__codex-agent-teams__teams_start', tool_input: args });
  assert.equal(bound.hookSpecificOutput.permissionDecision, 'allow');
  const started = await call('teams_start', bound.hookSpecificOutput.updatedInput);
  assert(!started.isError, JSON.stringify(started));
  let status;
  const until = Date.now() + 12000;
  do { status = JSON.parse((await call('teams_status', { taskId, verbose: true })).content[0].text); if (status.attempts.at(-1)?.turnId || status.status !== 'running') break; await delay(20); } while (Date.now() < until);
  assert(status.attempts.at(-1).turnId, JSON.stringify({ status: status.status, error: status.error }));
  assert.deepEqual(status.attempts.at(-1).host, { sessionId: session, turnId: 'host-turn' });
  assert.deepEqual(await runHook({ ...common, hook_event_name: 'Interrupt' }), {});
  status = JSON.parse((await call('teams_status', { taskId, verbose: true })).content[0].text);
  assert.equal(status.status, 'cancelled'); assert.equal(status.attempts.at(-1).cleanupConfirmed, true);
  await runHook({ ...common, hook_event_name: 'SessionEnd' });
});

test('unreachable registered endpoint reports unknown exit rather than a silent success', async t => {
  const f = await fixture(t), task = f.runtime.create(contract), session = newSession(t);
  await handleHostHook({ hook_event_name: 'PreToolUse', session_id: session, turn_id: 't', cwd: f.root,
    tool_name: 'mcp__codex_agent_teams__teams_start', tool_input: { taskId: task.id, workspace: f.root } });
  await f.lifecycle.close();
  const output = await handleHostHook({ hook_event_name: 'Interrupt', session_id: session, turn_id: 't' });
  assert.match(output.systemMessage, /尚未取得全部退出确认/);
});

test('old controller cannot remove a successor endpoint and publish repairs a missing endpoint', async t => {
  const f = await fixture(t);
  const successor = await startHostLifecycle(args => f.router.resolve(args));
  t.after(() => successor.close());
  const path = join(f.root, '.codex-teams/host-control.json');
  successor.publish(f.scope);
  const expected = readFileSync(path, 'utf8');
  await f.lifecycle.close();
  assert.equal(readFileSync(path, 'utf8'), expected);
  rmSync(path);
  successor.publish(f.scope);
  assert.equal(readFileSync(path, 'utf8'), expected);
  const endpoint = JSON.parse(expected), task = f.runtime.create(contract);
  const bound = await lifecycleRequest(endpoint, { event: 'bind', sessionId: 'new', turnId: 'turn', workspace: f.root, taskId: task.id });
  assert(bound.ticket, 'successor still accepts actual socket binding requests');
});

test('rejected start and integrate requests preserve the accepted attempt interruption owner', async t => {
  const f = await fixture(t);
  f.runtime.backend.run = async () => ({ result: structuredClone(report) });
  f.router.discoverModels = async () => ({ models: [{ model: 'strong-test-model', efforts: ['high'] }] });
  const server = createMcpServer(undefined, { route: args => f.router.resolve(args), lifecycle: f.lifecycle });
  const client = new Client({ name: 'rejected-binding-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); });
  await server.connect(a); await client.connect(b);
  for (const failure of ['duplicate-start', 'invalid-model', 'stale-integration']) {
    const task = f.runtime.create(contract);
    const bind = sessionId => lifecycleRequest(f.endpoint, { event: 'bind', sessionId, turnId: failure, workspace: f.root, taskId: task.id });
    const bound = await bind('owner'), binding = f.lifecycle.claim(f.scope, task.id, bound.ticket);
    const started = f.runtime.start(task.id, { host: binding.host }); f.lifecycle.started(binding, started.attemptId);
    await f.runtime.wait(task.id);
    assert.equal(f.runtime.status(task.id).status, 'awaiting_review');
    const other = await bind('other');
    const response = await client.callTool({ name: failure === 'stale-integration' ? 'teams_integrate' : 'teams_start', arguments: {
      workspace: f.root, taskId: task.id, hostTicket: other.ticket,
      ...(failure === 'stale-integration' ? { attemptId: 'stale' } : { models: { expert: { model: failure === 'invalid-model' ? 'missing' : 'strong-test-model', effort: 'high' } } }),
    } });
    assert.equal(response.isError, true);
    const otherStop = await lifecycleRequest(f.endpoint, { event: 'Interrupt', sessionId: 'other', turnId: failure });
    assert.equal(otherStop.cancelled.length, 0);
    assert.equal(f.runtime.status(task.id).status, 'awaiting_review');
    const ownerStop = await lifecycleRequest(f.endpoint, { event: 'Interrupt', sessionId: 'owner', turnId: failure });
    assert.equal(ownerStop.cancelled.length, 1);
    assert.equal(f.runtime.status(task.id).status, 'cancelled');
    assert.equal(f.runtime.status(task.id).attempts[0].host.sessionId, 'owner');
  }
  // Exercise the MCP acceptance seam without running a write command: only a
  // successful integration receipt should commit the new interruption owner.
  const task = f.runtime.create(contract);
  const bind = sessionId => lifecycleRequest(f.endpoint, { event: 'bind', sessionId, turnId: 'accepted-integration', workspace: f.root, taskId: task.id });
  const owner = await bind('owner'), binding = f.lifecycle.claim(f.scope, task.id, owner.ticket);
  const started = f.runtime.start(task.id); f.lifecycle.started(binding, started.attemptId); await f.runtime.wait(task.id);
  f.runtime.integrate = (taskId, attemptId) => ({ taskId, attemptId, status: 'integrating' });
  const other = await bind('other');
  assert(!(await client.callTool({ name: 'teams_integrate', arguments: { workspace: f.root, taskId: task.id, attemptId: started.attemptId, hostTicket: other.ticket } })).isError);
  const oldStop = await lifecycleRequest(f.endpoint, { event: 'Interrupt', sessionId: 'owner', turnId: 'accepted-integration' });
  assert.equal(oldStop.cancelled.length, 0);
  const newStop = await lifecycleRequest(f.endpoint, { event: 'Interrupt', sessionId: 'other', turnId: 'accepted-integration' });
  assert.equal(newStop.cancelled.length, 1);
});

test('reconnect keeps status read-only; zero-time wait republishes endpoint for a saved task', async t => {
  const f = await fixture(t, true), task = f.runtime.create(contract);
  await f.router.close(); await f.lifecycle.close();
  const router = new WorkspaceRouter({ profiles: config.profiles, maxConcurrency: 2, taskTimeoutMs: 1000 }, {
    createRuntime: settings => new TaskRuntime(new TaskStore(join(settings.workspace, '.codex-teams/state.sqlite')), { run: async () => { throw new Error('No inference in reconnect test'); } }, settings),
  });
  const lifecycle = await startHostLifecycle(args => router.resolve(args));
  const server = createMcpServer(undefined, { route: args => router.resolve(args), lifecycle });
  const client = new Client({ name: 'reconnect-hook-test', version: '1' });
  t.after(async () => { await client.close(); await server.close(); await router.close(); await lifecycle.close(); rmSync(f.root, { recursive: true, force: true }); });
  const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(a); await client.connect(b);
  const endpointPath = join(f.root, '.codex-teams/host-control.json');
  const args = { workspace: f.root, taskId: task.id };
  assert(!(await client.callTool({ name: 'teams_status', arguments: args })).isError);
  assert.equal(existsSync(endpointPath), false);
  assert(!(await client.callTool({ name: 'teams_wait', arguments: { ...args, timeoutMs: 0 } })).isError);
  assert.equal(existsSync(endpointPath), true);
  const hook = await handleHostHook({ hook_event_name: 'PreToolUse', session_id: newSession(t), turn_id: 'resumed', cwd: f.root,
    tool_name: 'mcp__codex_agent_teams__teams_start', tool_input: args });
  assert(hook.hookSpecificOutput.updatedInput.hostTicket);
});
