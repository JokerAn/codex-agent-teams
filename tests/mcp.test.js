import packageInfo from '../package.json' with { type: 'json' };
const clientVersion = () => packageInfo.version;
import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createMcpServer } from '../src/mcp.js';
import { setup, contract, report } from './helpers.js';

async function connectInMemory(t, runtime, capabilities, discoverModels) {
  const server = createMcpServer(runtime, { discoverModels });
  const client = new Client({ name: 'form-capability-tests', version: '1' }, { capabilities });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

test('SDK summary/catalog and selected panel validate combinations without acquiring runtime', async t => {
  const task = { id: 'selected-task', objective: 'fixture', status: 'succeeded', dependencies: [], attempts: [], updatedAt: new Date().toISOString() };
  const snapshot = { target: { root: process.cwd() }, tasks: [task], workspaces: [], owner: null, stateExists: true };
  const server = createMcpServer(() => { throw Error('No owner may be acquired'); }, { observe: () => snapshot });
  const client = new Client({ name: 'status-projections', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(a); await client.connect(b);
  t.after(async () => { await client.close(); await server.close(); });
  const call = args => client.callTool({ name: 'teams_status', arguments: args });
  for (const projection of ['summary', 'catalog']) {
    const result = await call({ overview: true, projection });
    assert(!result.isError, JSON.stringify(result));
    assert.equal(JSON.parse(result.content[0].text).tasks.length, projection === 'summary' ? 0 : 1);
    assert.doesNotMatch(result.content[1].text, /undefined/);
  }
  for (const args of [{ projection: 'summary' }, { overview: true, projection: 'catalog', taskId: task.id }, { taskIds: [] },
    { panel: true, overview: true }, { panel: true, taskIds: ['not-in-project'] }, { panel: true, taskIds: [task.id, task.id] }]) {
    assert((await call(args)).isError, JSON.stringify(args));
  }
  const panel = JSON.parse((await call({ panel: true, taskIds: [task.id] })).content[0].text).panel;
  assert.equal(panel.scope, 'selected-tasks');
  assert.equal(JSON.parse((await call({ panel: true, taskIds: [task.id] })).content[0].text).panel.url, panel.url);
  assert.notEqual(JSON.parse((await call({ panel: true })).content[0].text).panel.url, panel.url);
  assert.match(await (await fetch(panel.url)).text(), /本次选定任务/);
  assert.equal(JSON.parse((await call({ taskId: task.id, verbose: true })).content[0].text).objective, 'fixture');
});

test('SDK completed analysis exposes limitations without blockers and still requires captain review', async t => {
  const { runtime } = setup(t, { run: async () => ({ result: { ...report, limitations: ['No real Git fixture run'] } }) });
  const task = runtime.create(contract); runtime.start(task.id); await runtime.wait(task.id);
  const client = await connectInMemory(t, runtime, {}, undefined);
  const response = await client.callTool({ name: 'teams_status', arguments: { taskId: task.id } });
  const view = JSON.parse(response.content[0].text);
  assert.equal(view.status, 'awaiting_review'); assert.deepEqual(view.blockers, []);
  assert.deepEqual(view.limitations, ['No real Git fixture run']);
  assert.match(response.content[1].text, /验证局限/);
});

test('SDK review receipt stays bounded and retains full evidence through explicit status', async t => {
  const summary = 'large report '.repeat(1000).trim();
  const { runtime } = setup(t, { run: async () => ({ result: { ...report, summary } }) });
  const client = await connectInMemory(t, runtime, {}, undefined);
  for (const verdict of ['pass', 'reject']) {
    const task = runtime.create(contract); runtime.start(task.id); await runtime.wait(task.id);
    const args = { taskId: task.id, attemptId: runtime.status(task.id).attempts.at(-1).id, verdict,
      evidence: [{ criterion: contract.acceptance[0], evidence: 'Captain proof '.repeat(500).trim() }] };
    const result = await client.callTool({ name: 'teams_review', arguments: args });
    assert(!result.isError, JSON.stringify(result));
    const receipt = JSON.parse(result.content[0].text);
    assert.equal(receipt.status, verdict === 'pass' ? 'succeeded' : 'failed');
    assert.equal(receipt.review.verdict, verdict); assert.equal(receipt.review.authority, 'captain-attested');
    assert.equal(receipt.memberExitConfirmed, true); assert.equal(receipt.review.evidenceCount, 1);
    assert.equal(receipt.attempts, undefined); assert.equal(receipt.result, undefined);
    assert(Buffer.byteLength(JSON.stringify(result)) < 2000);
    assert.match(result.content[1].text, /队长复核/);
    const full = JSON.parse((await client.callTool({ name: 'teams_status', arguments: { taskId: task.id, verbose: true } })).content[0].text);
    assert.deepEqual(full.review.evidence, args.evidence);
    assert.equal(full.result.summary, summary);
  }
});

test('SDK incremental status and wait return bounded receipts and preserve legacy results', async t => {
  const { runtime } = setup(t);
  const task = runtime.create(contract);
  const client = await connectInMemory(t, runtime, {}, undefined);
  const call = (name, args) => client.callTool({ name, arguments: { taskId: task.id, ...args } });
  const first = JSON.parse((await call('teams_status', { incremental: true })).content[0].text);
  const same = await call('teams_wait', { afterCursor: first.cursor, timeoutMs: 0 });
  assert.equal(JSON.parse(same.content[0].text).unchanged, true);
  assert.match(same.content[1].text, /没有新记录/);
  assert.ok(Buffer.byteLength(JSON.stringify(same)) <= 1024, 'entire MCP response including receipt stays bounded');
  t.diagnostic(`MCP unchanged response: ${Buffer.byteLength(JSON.stringify(same))} bytes including receipt`);
  runtime.start(task.id); await runtime.wait(task.id);
  const stale = await call('teams_status', { afterCursor: first.cursor });
  assert.equal(stale.isError, true); assert.match(stale.content[0].text, /attempt/);
  const fresh = JSON.parse((await call('teams_status', { incremental: true })).content[0].text);
  const reviewed = runtime.review({ taskId: task.id, attemptId: fresh.attemptId, verdict: 'pass', evidence: task.acceptance.map(criterion => ({ criterion, evidence: 'fixture proof' })) });
  const changed = JSON.parse((await call('teams_status', { afterCursor: fresh.cursor })).content[0].text);
  assert.equal(changed.unchanged, false); assert.equal(changed.status, 'succeeded');
  assert.equal(changed.captainReview, 'pass'); assert.equal(changed.objective, undefined);
  const legacy = JSON.parse((await call('teams_status', {})).content[0].text);
  assert.equal(legacy.objective, reviewed.objective); assert.equal(legacy.cursor, undefined);
  assert.equal((await call('teams_status', { incremental: true, verbose: true })).isError, true);
});

test('compact SDK status and overview share orphan rules without acquiring runtime', async t => {
  const task = { id: 'orphan', objective: 'orphan', status: 'running', dependencies: [], updatedAt: '2026-10-14T00:00:00Z',
    attempts: [{ id: 'attempt', status: 'running', phase: 'member', startedAt: '2026-10-14T00:00:00Z' }] };
  const snapshot = { tasks: [task], workspaces: [], owner: null, stateExists: true };
  const server = createMcpServer(() => { throw Error('Observation must not acquire owner'); }, { observe: () => snapshot });
  const client = new Client({ name: 'orphan-tests', version: '1' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); });
  await server.connect(st); await client.connect(ct);
  const call = async args => JSON.parse((await client.callTool({ name: 'teams_status', arguments: args })).content[0].text);
  for (const owner of [null, { processAlive: false }, { processAlive: true }]) {
    snapshot.owner = owner;
    for (const status of ['running', 'integrating']) {
      task.status = status;
      task.attempts[0].integration = { startedAt: task.attempts[0].startedAt };
      const compact = await call({ taskId: task.id }), full = (await call({ taskId: task.id, overview: true })).tasks[0];
      assert.equal(compact.nextAction, full.nextAction);
      assert.equal(compact.nextActor, full.nextActor);
      if (!owner?.processAlive) {
        assert.equal(compact.elapsedMs, null); assert.equal(compact.attempts[0].elapsedMs, null);
        assert.equal(compact.integrationElapsedMs, null);
      }
    }
  }
  snapshot.owner = null; task.attempts[0].endedAt = '2026-10-14T00:00:10Z';
  assert.equal((await call({ taskId: task.id })).elapsedMs, 10000);
});

test('direct legacy SDK server rejects workspace arguments before cancel or forget can affect its fixed project', async t => {
  const { runtime, store } = setup(t);
  const task = runtime.create(contract);
  const selection = runtime.confirmModels({ expert: { model: 'test-model', effort: 'high' } }, 'mcp-elicitation', { remember: true });
  let runtimeLookups = 0;
  const client = await connectInMemory(t, () => { runtimeLookups++; return runtime; }, {}, async () => ({ workspace: runtime.config.workspace, models: [{ model: 'test-model', efforts: ['high'] }] }));
  const wrongWorkspace = tmpdir();
  for (const [name, args] of [['teams_cancel', { taskId: task.id }], ['teams_models', { forget: true }], ['teams_status', { taskId: task.id }]]) {
    const rejected = await client.callTool({ name, arguments: { ...args, workspace: wrongWorkspace } });
    assert.equal(rejected.isError, true);
    assert.match(rejected.content[0].text, /Direct legacy server does not route workspace arguments/);
  }
  assert.equal(runtimeLookups, 0, 'rejection must not invoke a fallback factory or create an owner');
  assert.equal(runtime.status(task.id).status, 'pending');
  assert.deepEqual(runtime.modelConfirmation, selection);
  assert.deepEqual(store.modelPreference(), selection);
  const cancelled = await client.callTool({ name: 'teams_cancel', arguments: { taskId: task.id } });
  assert.equal(JSON.parse(cancelled.content[0].text).status, 'cancelled', 'legacy calls omitting workspace retain their original behavior');
});

test('SDK form capability matrix distinguishes undeclared, legacy empty, explicit form and URL-only clients', async t => {
  for (const [label, elicitation, supported] of [
    ['undeclared', undefined, false], ['legacy', {}, true], ['form', { form: {} }, true], ['URL-only', { url: {} }, false],
  ]) await t.test(label, async t => {
    let owners = 0, forms = 0;
    const runtime = { active: new Map() };
    const client = await connectInMemory(t, () => { owners++; return runtime; }, elicitation === undefined ? {} : { elicitation }, async () => ({
      workspace: process.cwd(), models: [{ model: 'test-model', efforts: ['high'] }],
    }));
    if (elicitation !== undefined) client.setRequestHandler('elicitation/create', async req => {
      forms++; assert.equal(req.params.mode, 'form');
      assert.equal(req.params.requestedSchema.properties.remember.default, true);
      assert.ok(req.params.requestedSchema.required.includes('remember'));
      return { action: 'cancel' };
    });
    const response = await client.callTool({ name: 'teams_models', arguments: { confirm: true } });
    assert.equal(Boolean(response.isError), !supported);
    assert.equal(forms, supported ? 1 : 0);
    assert.equal(owners, 0, 'a cancelled form must not acquire the runtime');
    if (!supported) {
      assert.match(response.content[0].text, label === 'undeclared' ? /no elicitation capability was declared/ : /declared without form support/);
      assert.match(response.content[0].text, /close the MCP session holding this workspace/);
      assert.match(response.content[0].text, /stdin and stderr must both be TTY/);
    } else {
      const cancelled = JSON.parse(response.content[0].text);
      assert.equal(cancelled.status, 'cancel');
      assert.equal(cancelled.selectionChanged, false);
      assert.equal(cancelled.confirmationRequired, true);
    }
  });
});

test('active members and manual verification reject model changes before opening a host form', async t => {
  for (const [label, runtime] of [
    ['member', { active: new Map([['task', {}]]) }], ['verification', { active: new Map(), verification: {} }],
  ]) await t.test(label, async t => {
    let forms = 0;
    const client = await connectInMemory(t, runtime, { elicitation: { form: {} } }, async () => ({
      workspace: process.cwd(), models: [{ model: 'test-model', efforts: ['high'] }],
    }));
    client.setRequestHandler('elicitation/create', async () => { forms++; return { action: 'cancel' }; });
    const response = await client.callTool({ name: 'teams_models', arguments: { confirm: true } });
    assert.equal(response.isError, true);
    assert.match(response.content[0].text, /active execution to exit/);
    assert.equal(forms, 0);
  });
});

test('real SDK client connects over stdio; contracts validate before any paid call', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'teams-mcp-'));
  const configPath = join(dir, 'config.json');
  writeFileSync(configPath, JSON.stringify({ workspace: dir, profiles: { expert: { model: 'not-used-in-this-test' } } }));
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve('src/cli.js'), 'mcp', '--config', configPath], stderr: 'pipe' });
  const client = new Client({ name: 'teams-tests', version: '0.1.0' });
  t.after(async () => { await client.close(); rmSync(dir, { recursive: true, force: true }); });
  await client.connect(transport);
  const tools = await client.listTools();
  assert.equal(tools.tools.length, 8);
  assert.equal(tools.tools.find(tool => tool.name === 'teams_start').annotations.destructiveHint, true);
  assert.equal(existsSync(join(dir, '.codex-teams')), false, 'MCP inventory must not acquire a workspace runtime');
  const unused = await client.callTool({ name: 'teams_status', arguments: { overview: true } });
  assert.equal(JSON.parse(unused.content[0].text).counts.total, 0);
  assert.equal(existsSync(join(dir, '.codex-teams')), false, 'Status observation must not create owner');
  const created = await client.callTool({ name: 'teams_create', arguments: { expectedWorkspace: dir, objective: 'Inspect test config', acceptance: ['Cite config file'] } });
  assert.ok(!created.isError);
  const task = JSON.parse(created.content[0].text);
  assert.equal(task.profile, 'auto');
  const status = await client.callTool({ name: 'teams_status', arguments: { taskId: task.id } });
  assert.equal(JSON.parse(status.content[0].text).status, 'pending');
  const bound = await client.callTool({ name: 'teams_create', arguments: { expectedWorkspace: dir, objective: 'Read captured source', acceptance: ['Cite source'], executionPlan: { verification: { command: 'node', args: ['--version'] } } } });
  assert.ok(!bound.isError);
  assert.equal(JSON.parse(bound.content[0].text).executionPlan.dirtyPolicy, 'reject');
  assert.equal(JSON.parse(bound.content[0].text).executionPlan.verification.timeoutMs, 600000);
  const invalid = await client.callTool({ name: 'teams_create', arguments: { expectedWorkspace: dir, objective: 'Modify files', acceptance: ['write'], mode: 'workspace-write' } });
  assert.equal(invalid.isError, true);
  const cancel = await client.callTool({ name: 'teams_cancel', arguments: { taskId: task.id } });
  assert.equal(JSON.parse(cancel.content[0].text).status, 'cancelled');
});


test('MCP observation coexists with a live owner while mutating tools still respect ownership', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'teams-mcp-inventory-'));
  const configPath = join(dir, 'config.json');
  writeFileSync(configPath, JSON.stringify({ workspace: dir, profiles: { expert: { model: 'not-used-in-this-test' } } }));
  const clients = [];
  t.after(async () => { await Promise.all(clients.map(client => client.close())); rmSync(dir, { recursive: true, force: true }); });
  const connect = async () => {
    const client = new Client({ name: 'inventory-tests', version: '0.1.0' });
    clients.push(client);
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve('src/cli.js'), 'mcp', '--config', configPath], stderr: 'pipe' }));
    return client;
  };
  const owner = await connect();
  const task = await owner.callTool({ name: 'teams_create', arguments: { expectedWorkspace: dir, objective: 'Read source', acceptance: ['Cite file'] } });
  assert.ok(!task.isError);
  const inventory = await connect();
  assert.equal((await inventory.listTools()).tools.length, 8);
  const observed = await inventory.callTool({ name: 'teams_status', arguments: { overview: true } });
  assert.ok(!observed.isError);
  assert.equal(JSON.parse(observed.content[0].text).counts.pending, 1);
  assert.equal(JSON.parse(observed.content[0].text).runtime.version, clientVersion());
  const busy = await inventory.callTool({ name: 'teams_create', arguments: { expectedWorkspace: dir, objective: 'Another writer', acceptance: ['proof'] } });
  assert.equal(busy.isError, true);
  assert.match(busy.content[0].text, /Another runtime owns this workspace/);
  await inventory.close();
  const state = await owner.callTool({ name: 'teams_status', arguments: { taskId: JSON.parse(task.content[0].text).id } });
  assert.equal(JSON.parse(state.content[0].text).status, 'pending');
});
