import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { CodexBackend, memberOverrides } from '../src/app-server.js';
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
