import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { selectProfile } from '../src/policy.js';
import { modelChoices, acceptedModelRoles, modelSelectionForm } from '../src/models.js';
import { setup, contract, report, config } from './helpers.js';
import { CodexBackend } from '../src/app-server.js';

const expert = { model: 'test-model', effort: 'high' }, simple = { model: 'configured-model', effort: 'high' };
const content = { expert: JSON.stringify(expert), simple: JSON.stringify(simple), confirm: true };
const catalog = { models: [expert, simple].map(p => ({ model: p.model, displayName: p.model, efforts: [p.effort] })) };

test('routing uses explicit simplicity, protects review/uncertain tasks and allows expert override', () => {
  const options = { profiles: { expert, simple } };
  for (const kind of ['lookup', 'analysis', 'implementation']) {
    assert.equal(selectProfile({ profile: 'auto', complexity: 'simple', kind }, options).model, simple.model);
    assert.equal(selectProfile({ profile: 'expert', complexity: 'simple', kind }, options).model, expert.model);
  }
  for (const complexity of ['bounded', 'uncertain', 'complex']) {
    assert.equal(selectProfile({ profile: 'auto', complexity, kind: 'analysis' }, options).model, expert.model);
    assert.throws(() => selectProfile({ profile: 'simple', complexity, kind: 'analysis' }, options), /requires a simple/);
  }
  assert.equal(selectProfile({ profile: 'auto', complexity: 'simple', kind: 'review' }, options).model, expert.model);
  assert.throws(() => selectProfile({ profile: 'simple', complexity: 'simple', kind: 'review' }, options));
  assert.equal(selectProfile({ profile: 'auto', complexity: 'simple' }, { profiles: { expert } }).model, expert.model);
});

test('form choices preserve exact model/effort pairs and never infer approval or capabilities', () => {
  assert.equal(modelChoices(catalog).length, 2);
  assert.equal(modelSelectionForm(catalog, '/workspace').requestedSchema.properties.confirm.default, false);
  assert.deepEqual(acceptedModelRoles(content, catalog), { expert, simple });
  assert.deepEqual(acceptedModelRoles({ ...content, simple: 'none' }, catalog), { expert });
  for (const invalid of [{ ...content, confirm: false }, { ...content, expert: '{"model":"other"}' }, { ...content, simple: JSON.stringify({ ...simple, effort: 'low' }) }, { expert: content.expert, confirm: true }]) assert.throws(() => acceptedModelRoles(invalid, catalog));
  assert.throws(() => modelChoices({ models: [] }), /no selectable/);
});

test('confirmed runtime records selection per attempt, retries on expert and rejects active reconfiguration', async t => {
  let release;
  const seen = [];
  const { runtime } = setup(t, { run: req => { seen.push(req.selection); return new Promise(resolve => { release = () => resolve({ result: report, actualModel: req.selection.model }); }); } });
  runtime.requireModelConfirmation = true;
  const task = runtime.create({ ...contract, complexity: 'simple' });
  assert.throws(() => runtime.start(task.id), /User model confirmation/);
  assert.equal(runtime.status(task.id).attempts.length, 0);
  runtime.confirmModels({ expert, simple }, 'mcp-elicitation');
  runtime.start(task.id);
  assert.throws(() => runtime.confirmModels({ expert }, 'mcp-elicitation'), /active execution/);
  assert.throws(() => runtime.forgetModels(), /active execution/);
  release(); await runtime.wait(task.id);
  const first = runtime.status(task.id).attempts[0];
  assert.equal(first.selection.profile, 'simple'); assert.equal(first.modelConfirmation.source, 'mcp-elicitation');
  assert.deepEqual(first.reviewerSelection, expert);
  runtime.review({ taskId: task.id, attemptId: first.id, verdict: 'reject', evidence: [{ criterion: contract.acceptance[0], evidence: 'needs deeper analysis' }] });
  runtime.start(task.id, { retry: true, reason: 'escalate after rejected result' }); release(); await runtime.wait(task.id);
  assert.deepEqual(seen.map(p => p.model), [simple.model, expert.model]);
});

test('host discovery paginates, excludes hidden choices and returns only model settings', async () => {
  const backend = new CodexBackend({ binary: process.execPath, args: [resolve('tests/fixtures/fake-app-server.js'), 'catalog-paged'] });
  const result = await backend.probe(process.cwd(), { modelSettings: true });
  assert.deepEqual(result.models.map(model => model.model), ['test-model', 'configured-model']);
  assert.equal(result.configuredModel, 'test-model'); assert.equal(result.configuredEffort, 'high');
  assert.equal(result.models[0].displayName, 'test-model label');
  assert.equal(JSON.stringify(result).includes('SECRET_FIXTURE'), false);
  assert.equal(result.inferenceStarted, false);
});

async function mcpFixture(t, handler, mode = 'catalog-paged') {
  const dir = mkdtempSync(join(tmpdir(), 'teams-models-'));
  const binary = join(dir, 'fake-codex');
  writeFileSync(binary, `#!/usr/bin/env node\nprocess.argv[2]=${JSON.stringify(mode)};await import(${JSON.stringify(new URL('./fixtures/fake-app-server.js', import.meta.url).href)});\n`, { mode: 0o755 });
  const configPath = join(dir, 'config.json');
  writeFileSync(configPath, JSON.stringify({ ...config, workspace: dir, codexBin: binary }));
  const clients = [];
  t.after(async () => { await Promise.all(clients.map(client => client.close())); rmSync(dir, { recursive: true, force: true }); });
  const connect = async () => {
    const client = new Client({ name: 'model-confirmation-test', version: '1' }, handler ? { capabilities: { elicitation: { form: {} } } } : {});
    if (handler) client.setRequestHandler('elicitation/create', handler);
    clients.push(client);
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve('src/cli.js'), 'mcp', '--config', configPath], stderr: 'pipe' }));
    return client;
  };
  const client = await connect();
  const call = async (name, args = {}, target = client) => {
    const response = await target.callTool({ name, arguments: name === 'teams_create' ? { expectedWorkspace: dir, ...args } : args });
    return { isError: Boolean(response.isError), value: response.isError ? response.content[0].text : JSON.parse(response.content[0].text) };
  };
  return { dir, configPath, client, connect, call };
}

test('real SDK user form gates start, decline/cancel/invalid input do not approve; approval expires on restart', async t => {
  let response = { action: 'decline' }, forms = 0;
  const f = await mcpFixture(t, async req => {
    forms++; assert.equal(req.params.mode, 'form');
    assert.deepEqual(req.params.requestedSchema.properties.expert.enum, modelChoices(catalog).map(c => c.value));
    return response;
  });
  const listed = await f.call('teams_models');
  assert.equal(listed.value.confirmationRequired, true);
  assert.equal(existsSync(join(f.dir, '.codex-teams')), false);
  const task = (await f.call('teams_create', { ...contract, complexity: 'simple' })).value;
  assert.match((await f.call('teams_start', { taskId: task.id })).value, /User model confirmation/);
  assert.equal((await f.call('teams_models', { confirm: true })).value.status, 'decline');
  response = { action: 'cancel' };
  assert.equal((await f.call('teams_models', { confirm: true })).value.status, 'cancel');
  response = { action: 'accept', content: { ...content, confirm: false } };
  assert.equal((await f.call('teams_models', { confirm: true })).isError, true);
  assert.equal((await f.call('teams_start', { taskId: task.id })).isError, true);
  response = { action: 'accept', content };
  assert.equal((await f.call('teams_models', { confirm: true })).value.status, 'confirmed');
  assert.equal((await f.call('teams_models')).value.confirmationRequired, false);
  assert.equal((await f.call('teams_start', { taskId: task.id })).value.selection.model, simple.model);
  const ready = (await f.call('teams_wait', { taskId: task.id, timeoutMs: 5000 })).value;
  assert.equal(ready.status, 'awaiting_review'); assert.equal(ready.attempts[0].actualModel, simple.model);
  assert.equal(forms, 4);
  const pending = (await f.call('teams_create', contract)).value;
  await f.client.close();
  const restarted = await f.connect();
  assert.match((await f.call('teams_start', { taskId: pending.id }, restarted)).value, /User model confirmation/);
});

test('unsupported host and agent-supplied approval cannot bypass confirmation; CLI non-TTY fails closed', async t => {
  const f = await mcpFixture(t);
  assert.match((await f.call('teams_models', { confirm: true })).value, /does not support MCP form/);
  assert.equal((await f.call('teams_models', { confirm: true, expert: content.expert, approved: true })).isError, true);
  const task = (await f.call('teams_create', contract)).value;
  assert.equal((await f.call('teams_start', { taskId: task.id })).isError, true);
  await f.client.close();
  const data = JSON.parse(execFileSync(process.execPath, ['src/cli.js', 'models', '--config', f.configPath], { encoding: 'utf8' }));
  assert.equal(data.models.length, 2); assert.equal(data.inferenceStarted, false);
  assert.throws(() => execFileSync(process.execPath, ['src/cli.js', 'start', '--config', f.configPath, '--id', task.id, '--workspace', f.dir], { stdio: 'pipe' }), error => /interactive terminal/.test(error.stderr.toString()));
});

test('a model removed while the user answers is rejected; a pending form blocks concurrent starts', async t => {
  let answer, opened;
  const formOpened = new Promise(resolve => { opened = resolve; });
  const f = await mcpFixture(t, () => { opened(); return new Promise(resolve => { answer = resolve; }); }, 'catalog-revokable');
  const task = (await f.call('teams_create', contract)).value;
  const confirming = f.call('teams_models', { confirm: true });
  await formOpened;
  assert.match((await f.call('teams_start', { taskId: task.id })).value, /confirmation to finish/);
  writeFileSync(join(f.dir, 'revoke-model'), 'revoked');
  answer({ action: 'accept', content });
  const rejected = await confirming;
  assert.equal(rejected.isError, true);
  assert.match(rejected.value, /current Codex catalog/);
  assert.equal((await f.call('teams_models')).value.confirmationRequired, true);
  assert.equal((await f.call('teams_start', { taskId: task.id })).isError, true);
});

test('remember requires user opt-in, survives restart without a form, and forget revokes it', async t => {
  let response = { action: 'accept', content: { ...content, remember: true } }, forms = 0;
  const f = await mcpFixture(t, async () => { forms++; return response; });
  const confirmed = await f.call('teams_models', { confirm: true });
  assert.equal(confirmed.value.selection.scope, 'workspace');
  assert.equal(forms, 1);
  response = { action: 'cancel' };
  assert.equal((await f.call('teams_models', { confirm: true })).value.selectionChanged, false);
  await f.client.close();
  const restarted = await f.connect();
  const listed = await f.call('teams_models', {}, restarted);
  assert.equal(listed.value.confirmationRequired, false);
  assert.equal(listed.value.selection.confirmedAt, confirmed.value.selection.confirmedAt);
  const task = (await f.call('teams_create', { ...contract, complexity: 'simple', profile: 'simple' }, restarted)).value;
  assert.equal((await f.call('teams_start', { taskId: task.id }, restarted)).isError, false);
  assert.equal((await f.call('teams_wait', { taskId: task.id, timeoutMs: 5000 }, restarted)).value.status, 'awaiting_review');
  assert.equal(forms, 2, 'restart must not invent or request another user answer');
  const cliTask = (await f.call('teams_create', contract, restarted)).value;
  await restarted.close();
  const cliResult = JSON.parse(execFileSync(process.execPath, ['src/cli.js', 'start', '--config', f.configPath, '--id', cliTask.id, '--workspace', f.dir], { encoding: 'utf8', timeout: 10000, stdio: 'pipe' }));
  assert.equal(cliResult.status, 'awaiting_review');
  assert.equal(cliResult.attempts[0].modelConfirmation.confirmedAt, confirmed.value.selection.confirmedAt);
  const afterCli = await f.connect();
  assert.equal((await f.call('teams_models', { forget: true }, afterCli)).value.status, 'forgotten');
  const pending = (await f.call('teams_create', contract, afterCli)).value;
  assert.match((await f.call('teams_start', { taskId: pending.id }, afterCli)).value, /User model confirmation/);
  await afterCli.close();
  const again = await f.connect();
  assert.equal((await f.call('teams_models', {}, again)).value.confirmationRequired, true);
});

test('saved selection fails closed if its model disappears, and session-only confirmation clears it', async t => {
  let response = { action: 'accept', content: { ...content, remember: true } };
  const f = await mcpFixture(t, async () => response, 'catalog-revokable');
  await f.call('teams_models', { confirm: true });
  writeFileSync(join(f.dir, 'revoke-model'), 'revoked');
  assert.equal((await f.call('teams_models')).value.confirmationRequired, true);
  const task = (await f.call('teams_create', contract)).value;
  assert.equal((await f.call('teams_start', { taskId: task.id })).isError, true);
  rmSync(join(f.dir, 'revoke-model'));
  response = { action: 'accept', content: { ...content, remember: false } };
  assert.equal((await f.call('teams_models', { confirm: true })).value.selection.scope, 'runtime-session');
  await f.client.close();
  const restarted = await f.connect();
  assert.equal((await f.call('teams_models', {}, restarted)).value.confirmationRequired, true);
});

test('MCP rejects an intended workspace different from the configured checkout before creating a task', async t => {
  const f = await mcpFixture(t);
  const wrong = await f.call('teams_create', { ...contract, expectedWorkspace: process.cwd() });
  assert.equal(wrong.isError, true);
  assert.match(wrong.value, /Target workspace mismatch/);
  const missing = await f.call('teams_create', { ...contract, expectedWorkspace: undefined });
  assert.equal(missing.isError, true);
  assert.equal((await f.call('teams_status', { overview: true })).value.counts.total, 0);
});
