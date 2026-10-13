import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { TaskStore } from '../src/store.js';
import { TaskRuntime } from '../src/runtime.js';
import { waitWithProgress } from '../src/cli-progress.js';
import { readSnapshot } from '../src/status.js';
import { config, contract, report, setup, tick } from './helpers.js';

test('foreground waits show phase changes and periodic observations without completing or cancelling a member', async t => {
  let release, progress;
  const f = setup(t, { run: request => {
    progress = request.onProgress;
    return new Promise(resolve => { release = () => resolve({ result: report }); });
  } });
  const task = f.runtime.create(contract);
  f.runtime.start(task.id);
  const receipts = [];
  const observing = waitWithProgress(f.runtime, task.id, { intervalMs: 5, repeatMs: 15, write: text => receipts.push(text) });
  await tick();
  await delay(40);
  assert.equal(f.runtime.status(task.id).status, 'running');
  assert.ok(receipts.length >= 2, 'same phase still gets a bounded periodic observation');
  assert.match(receipts[0], /记录时间，不是实时心跳/);
  progress({ actualModel: 'actual-model' });
  await delay(15);
  assert.ok(receipts.some(text => text.includes('actual-model')));
  release();
  const result = await observing;
  assert.equal(result.status, 'awaiting_review');
  assert.match(receipts.at(-1), /成员已提交，尚未验收/);
  const count = receipts.length;
  await delay(20);
  assert.equal(receipts.length, count, 'no background reporter survives the foreground wait');
});

test('foreground waits preserve cancellation and wait for runtime exit', async t => {
  let exited = false;
  const f = setup(t, { run: async ({ signal }) => {
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
    await delay(25);
    exited = true;
    throw signal.reason;
  } });
  const task = f.runtime.create(contract);
  f.runtime.start(task.id);
  const receipts = [];
  const observing = waitWithProgress(f.runtime, task.id, { intervalMs: 5, write: text => receipts.push(text) });
  await tick();
  const cancelled = f.runtime.cancel(task.id);
  const result = await observing;
  await cancelled;
  assert.equal(exited, true);
  assert.equal(result.status, 'cancelled');
  assert.match(receipts.at(-1), /已取消/);
  assert.equal(f.runtime.active.has(task.id), false);
});

async function cliFixture(t, mode = 'normal', { saved = true, interactive = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'teams-cli-progress-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const binary = join(dir, 'fake-codex');
  writeFileSync(binary, `#!/usr/bin/env node\nprocess.argv[2]=${JSON.stringify(mode)};await import(${JSON.stringify(new URL('./fixtures/fake-app-server.js', import.meta.url).href)});\n`, { mode: 0o755 });
  const settings = { ...config, workspace: dir, codexBin: binary, taskTimeoutMs: 30000, profiles: { expert: { model: 'test-model', effort: 'high' } } };
  const configPath = join(dir, 'config.json');
  writeFileSync(configPath, JSON.stringify(settings));
  const runtime = new TaskRuntime(new TaskStore(join(dir, '.codex-teams/state.sqlite')), {}, settings);
  let task;
  try {
    if (saved) runtime.confirmModels(settings.profiles, 'interactive-terminal', { remember: true });
    task = runtime.create(contract);
  } finally { await runtime.close(); }
  const args = [resolve('src/cli.js'), 'start', '--config', configPath, '--id', task.id, '--workspace', dir];
  const code = `process.stdin.isTTY=true;process.stderr.isTTY=true;process.argv=${JSON.stringify(args)};await import(${JSON.stringify(new URL('../src/cli.js', import.meta.url).href)});`;
  const child = spawn(process.execPath, interactive ? ['--input-type=module', '-e', code] : args, { stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; });
  const done = new Promise((resolveExit, reject) => { child.once('error', reject); child.once('close', exitCode => resolveExit({ exitCode, stdout, stderr })); });
  return { child, done, dir, task, stderr: () => stderr };
}

test('CLI start prints receipts on stderr and leaves stdout as one JSON result with saved human confirmation', async t => {
  const { done } = await cliFixture(t);
  const { exitCode, stdout, stderr } = await done;
  assert.equal(exitCode, 0, stderr);
  const result = JSON.parse(stdout);
  assert.equal(result.status, 'awaiting_review');
  assert.equal(result.attempts[0].modelConfirmation.scope, 'workspace');
  assert.match(stderr, /Agent Teams 已启动/);
  assert.match(stderr, /成员执行/);
  assert.match(stderr, /成员已提交，尚未验收/);
});

test('CLI SIGTERM prints the final cancellation receipt before releasing its store owner', { timeout: 15000 }, async t => {
  const { child, done, dir, task } = await cliFixture(t, 'hang');
  const deadline = Date.now() + 10000;
  let started = false;
  while (Date.now() < deadline) {
    const attempt = readSnapshot(dir, task.id).tasks[0].attempts.at(-1);
    if (attempt?.turnId) { started = true; break; }
    if (child.exitCode !== null) break;
    await delay(10);
  }
  assert.equal(started, true, 'send signal only after the controlled member has really started');
  child.kill('SIGTERM');
  const { exitCode, stdout, stderr } = await done;
  assert.equal(exitCode, 1, stderr);
  const result = JSON.parse(stdout);
  assert.equal(result.status, 'cancelled');
  assert.equal(result.attempts.at(-1).cleanupConfirmed, true);
  assert.match(stderr, /已取消/);
  assert.doesNotMatch(stderr, /database.*(?:closed|open)|Statement has been finalized/);
  assert.equal(readSnapshot(dir).owner, null);
});

test('CLI SIGTERM during model input exits without selecting models or starting a member', { timeout: 15000 }, async t => {
  // Controlled TTY flags exercise the real readline path; no human acceptance is simulated.
  const f = await cliFixture(t, 'normal', { saved: false, interactive: true });
  const deadline = Date.now() + 10000;
  while (!f.stderr().includes('强模型编号：') && Date.now() < deadline && f.child.exitCode === null) await delay(10);
  assert.match(f.stderr(), /强模型编号：/);
  f.child.kill('SIGTERM');
  const { exitCode, stdout, stderr } = await f.done;
  assert.equal(exitCode, 1, stderr);
  assert.equal(stdout, '');
  assert.doesNotMatch(stderr, /database.*(?:closed|open)/);
  const snapshot = readSnapshot(f.dir, f.task.id);
  assert.equal(snapshot.owner, null);
  assert.equal(snapshot.modelPreference, null);
  assert.equal(snapshot.tasks[0].status, 'pending');
  assert.equal(snapshot.tasks[0].attempts.length, 0);
});
