import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppServerClient, CodexBackend, memberOverrides } from '../src/app-server.js';
import { processAlive } from '../src/store.js';

const fixture = fileURLToPath(new URL('./fixtures/fake-app-server.js', import.meta.url));
const backend = mode => new CodexBackend({ binary: process.execPath, args: [fixture, mode], requestTimeoutMs: 1000 });
const request = signal => ({ cwd: process.cwd(), selection: { model: 'test-model', effort: 'high' }, acceptance: ['prove it'], prompt: JSON.stringify({ acceptance: ['prove it'] }), signal });

test('protocol race, isolation overrides, structured output, usage and cleanup', async () => {
  let pid;
  const result = await backend('normal').run({ ...request(new AbortController().signal), onProgress: p => { pid ??= p.childPid; } });
  assert.equal(result.result.criteria[0].criterion, 'prove it');
  assert.equal(result.usage.total.totalTokens, 15);
  assert.equal(result.actualModel, 'test-model');
  assert.equal(processAlive(pid), false);
});

test('diagnostic handshake enumerates models without starting inference', async () => {
  const result = await backend('normal').probe();
  assert.equal(result.inferenceStarted, false);
  assert.equal(result.models[0].model, 'test-model');
});

for (const [mode, message] of [['approval', /needs interaction/], ['crash', /closed/], ['bad-json', /protocol frame/], ['timeout', /timed out/], ['unsafe', /did not confirm/]]) {
  test(`${mode} fails without reporting successful execution and reaps child`, async () => {
    let pid;
    await assert.rejects(backend(mode).run({ ...request(new AbortController().signal), onProgress: p => { pid ??= p.childPid; } }), message);
    assert.equal(processAlive(pid), false);
  });
}

test('abort interrupts and reaps a hanging member', async () => {
  const controller = new AbortController();
  let pid;
  const running = backend('hang').run({ ...request(controller.signal), onProgress: p => {
    pid ??= p.childPid;
    if (p.turnId) controller.abort(new Error('test-cancel'));
  } });
  await assert.rejects(running, /test-cancel/);
  assert.equal(processAlive(pid), false);
});

test('already aborted signal does not leave a spawned process', async () => {
  await assert.rejects(backend('hang').run(request(AbortSignal.abort(new Error('already-cancelled')))), /already-cancelled/);
});


test('real-host regression: MCP override keys are plain dotted paths, unusual keys fail closed', () => {
  assert.equal(memberOverrides({ mcp_servers: { 'frontend-code-skimmer': {} } })['mcp_servers.frontend-code-skimmer.enabled'], false);
  assert.throws(() => memberOverrides({ mcp_servers: { 'server.with.dots': {} } }), /Cannot safely disable/);
});

test('doctor can verify real permission response without a model turn', async () => {
  const result = await backend('normal').probe(process.cwd(), { checkThread: true });
  assert.equal(result.threadCheck.sandbox.type, 'readOnly');
  assert.equal(result.inferenceStarted, false);
});


test('doctor checks configured profiles and rejects unavailable models or efforts', async () => {
  const result = await backend('normal').probe(process.cwd(), { profiles: { expert: { model: 'configured-model', effort: 'high' } }, checkThread: true });
  assert.equal(result.profileChecks[0].available, true);
  assert.equal(result.threadCheck.model, 'configured-model');
  await assert.rejects(backend('normal').probe(process.cwd(), { profiles: { expert: { model: 'missing-model' } } }), /expert model is unavailable/);
  await assert.rejects(backend('normal').probe(process.cwd(), { profiles: { expert: { model: 'test-model', effort: 'unsupported' } } }), /expert effort is unsupported/);
});

test('doctor only reports plugin discovery when both skill and MCP server are visible', async () => {
  const plugin = { marketplacePath: '/fixture/.agents/plugins/marketplace.json', pluginName: 'codex-agent-teams' };
  const result = await backend('normal').probe(process.cwd(), { plugin });
  assert.deepEqual(result.pluginCheck.skills, ['codex-agent-teams:team']);
  assert.equal(result.pluginCheck.installed, false);
  assert.equal(result.pluginCheck.mcpConnectionChecked, false);
  await assert.rejects(backend('plugin-missing').probe(process.cwd(), { plugin }), /did not discover/);
});

test('real backend persists launch phase before spawning and reports exit only after cleanup', async () => {
  const updates = [];
  await backend('normal').run({ ...request(new AbortController().signal), onProgress: update => updates.push(update) });
  assert.equal(updates[0].memberLaunch, 'starting');
  assert.equal(updates.find(update => update.memberLaunch === 'active').childPid > 0, true);
  assert.equal(updates.at(-1).memberLaunch, 'exited');
});

for (const mode of ['wrong-cwd', 'missing-cwd', 'invalid-cwd']) {
  for (const options of [{ mode: 'read-only' }, { mode: 'read-only', role: 'review' }, { mode: 'workspace-write' }]) {
    test(`${mode} rejects ${options.role ?? options.mode} before inference and confirms exit`, async () => {
      const updates = [];
      await assert.rejects(backend(mode).run({ ...request(new AbortController().signal), ...options, onProgress: update => updates.push(update) }), /requested working directory/);
      assert.equal(updates.some(update => update.turnId), false);
      assert.equal(updates.at(-1).memberLaunch, 'exited');
      assert.equal(processAlive(updates.find(update => update.childPid).childPid, true), false);
    });
  }
}

for (const mode of ['read-only', 'workspace-write']) {
  test(`${mode} accepts canonical host cwd for a symlinked request`, async t => {
    const temporary = mkdtempSync(join(tmpdir(), 'teams-cwd-'));
    t.after(() => rmSync(temporary, { recursive: true, force: true }));
    const alias = join(temporary, 'repository');
    symlinkSync(realpathSync(process.cwd()), alias, 'dir');
    const result = await backend('canonical-cwd').run({ ...request(new AbortController().signal), cwd: alias, mode });
    assert.equal(result.result.criteria[0].satisfied, true);
  });
}

test('doctor refuses an unexpected cwd without starting inference', async () => {
  await assert.rejects(backend('wrong-cwd').probe(process.cwd(), { checkThread: true }), /requested working directory/);
});

for (const failure of ['invalid-json', 'oversized-frame']) {
  test(`${failure} releases protocol buffer, rejects pending requests and discards later output`, async t => {
    const client = new AppServerClient({ binary: process.execPath, args: [fixture, 'normal'], requestTimeoutMs: 1000 });
    t.after(() => client.stop());
    await client.initialize();
    const notifications = [], errors = [];
    client.on('notification', (...args) => notifications.push(args));
    client.on('fatal', error => errors.push(error));
    const rejected = assert.rejects(client.request('fixture/no-response'), failure === 'invalid-json' ? /protocol frame/ : /frame exceeds 16 MiB/);
    const valid = JSON.stringify({ method: 'fixture/notification', params: {} }) + '\n';
    if (failure === 'invalid-json') client.child.stdout.emit('data', 'not-json\n' + valid);
    else {
      const chunk = '字'.repeat(16 * 1024);
      for (let i = 0; i < 341; i++) client.child.stdout.emit('data', chunk);
      assert.equal(client.frameBufferBytes, 341 * Buffer.byteLength(chunk));
      client.child.stdout.emit('data', chunk);
    }
    await rejected;
    client.child.stdout.emit('data', 'x'.repeat(1024 * 1024));
    client.child.stdout.emit('data', valid);
    assert.equal(client.frameBuffer, '');
    assert.equal(client.frameBufferBytes, 0);
    assert.equal(client.pending.size, 0);
    assert.equal(errors.length, 1);
    assert.deepEqual(notifications, []);
    await client.stop();
    assert.equal(processAlive(client.child.pid, true), false);
  });
}

test('protocol byte accounting handles partial unicode frames and multiple notifications', async t => {
  const client = new AppServerClient({ binary: process.execPath, args: [fixture, 'normal'] });
  t.after(() => client.stop());
  await client.initialize();
  const notifications = [];
  client.on('notification', (method, params) => notifications.push([method, params]));
  const frame = JSON.stringify({ method: 'fixture/unicode', params: { text: '证据' } });
  client.child.stdout.emit('data', frame.slice(0, -2));
  assert.equal(client.frameBufferBytes, Buffer.byteLength(frame.slice(0, -2)));
  client.child.stdout.emit('data', frame.slice(-2) + '\n' + frame + '\n');
  assert.equal(client.frameBufferBytes, 0);
  assert.equal(client.frameBuffer, '');
  assert.equal(notifications.length, 2);
  assert.deepEqual(notifications[0], ['fixture/unicode', { text: '证据' }]);
});

test('continuous oversized output ignoring TERM fails and is reaped before backend exit', async () => {
  const updates = [];
  await assert.rejects(backend('output-flood').run({ ...request(new AbortController().signal), onProgress: update => updates.push(update) }), /frame exceeds 16 MiB/);
  assert.equal(updates.at(-1).memberLaunch, 'exited');
  assert.equal(processAlive(updates.find(update => update.childPid).childPid, true), false);
});


test('a legal boundary-sized frame followed by another frame in the same chunk is accepted', async t => {
  const client = new AppServerClient({ binary: process.execPath, args: [fixture, 'normal'] });
  t.after(() => client.stop());
  await client.initialize();
  const notifications=[];
  client.on('notification',method=>notifications.push(method));
  const empty=JSON.stringify({method:'fixture/boundary',params:{text:''}});
  const first=JSON.stringify({method:'fixture/boundary',params:{text:'x'.repeat(16*1024*1024-Buffer.byteLength(empty))}});
  assert.equal(Buffer.byteLength(first),16*1024*1024);
  client.child.stdout.emit('data',first.slice(0,-1));
  client.child.stdout.emit('data',first.slice(-1)+'\n'+JSON.stringify({method:'fixture/next',params:{}})+'\n');
  assert.equal(client.failure,undefined);
  assert.deepEqual(notifications,['fixture/boundary','fixture/next']);
  assert.equal(client.frameBufferBytes,0);
  assert.equal(client.frameBuffer,'');
});
