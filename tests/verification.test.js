import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { once } from 'node:events';
import { runVerification, verificationSchema } from '../src/verification.js';
import { processAlive, TaskStore } from '../src/store.js';
import { TaskRuntime } from '../src/runtime.js';

const command = (code, options = {}) => ({ command: process.execPath, args: ['-e', code], timeoutMs: 2000, ...options });
function logsFixture(t, cleanup = true) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'teams-verify-')));
  if (cleanup) t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, cwd: root, logDir: join(root, 'logs') };
}
async function until(predicate) {
  const deadline = Date.now() + 3000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error('Test condition timed out'); await delay(10); }
}
function runtimeFixture(t) {
  const f = logsFixture(t, false), repo = join(f.root, '源 repo'); mkdirSync(repo);
  const git = args => execFileSync('git', ['-C', repo, ...args], { stdio: 'pipe', encoding: 'utf8' });
  git(['init', '-b', 'main']); git(['config', 'user.name', 'Test']); git(['config', 'user.email', 'test@localhost']);
  writeFileSync(join(repo, '.gitignore'), '.codex-teams/\n'); writeFileSync(join(repo, 'proof.txt'), 'baseline');
  git(['add', '.']); git(['commit', '-m', 'initial']);
  const config = { workspace: repo, maxConcurrency: 2, taskTimeoutMs: 1000, profiles: { expert: { model: 'never-called' } } };
  let runtime;
  const open = () => runtime = new TaskRuntime(new TaskStore(join(repo, '.codex-teams/state.sqlite')), { run: () => { throw new Error('No inference'); } }, config);
  open();
  t.after(async () => { await runtime.close(); rmSync(f.root, { recursive: true, force: true }); });
  return { ...f, repo, config, git, get runtime() { return runtime; }, reopen: async () => { await runtime.close(); return open(); } };
}

test('real command preserves literal arguments, binary stdout/stderr and exit metadata without a shell', async t => {
  const f = logsFixture(t);
  const literal = '$(touch injected); `touch injected` && 空格';
  const spec = command("process.stdout.write(Buffer.from([0,255,10])); process.stderr.write(process.argv[1]);");
  spec.args.push(literal);
  const result = await runVerification(spec, f);
  assert.equal(result.status, 'passed'); assert.equal(result.exitCode, 0); assert.equal(result.signal, null);
  assert.equal(result.cleanupConfirmed, true); assert.equal(processAlive(result.childPid, true), false);
  assert.deepEqual(readFileSync(result.stdoutPath), Buffer.from([0, 255, 10]));
  assert.equal(readFileSync(result.stderrPath, 'utf8'), literal);
  assert.equal(existsSync(join(f.root, 'injected')), false);
  assert.equal(result.stdoutBytes, 3); assert.equal(result.stderrBytes, Buffer.byteLength(literal));
});

test('nonzero exit and missing executable are recorded as failures rather than successful checks', async t => {
  const f = logsFixture(t);
  const nonzero = await runVerification(command("console.error('assertion failed');process.exit(7)"), f);
  assert.equal(nonzero.status, 'failed'); assert.equal(nonzero.exitCode, 7); assert.equal(nonzero.cleanupConfirmed, true);
  const missing = await runVerification({ command: join(f.root, 'missing'), args: [] }, { ...f, logDir: join(f.root, 'missing-logs') });
  assert.equal(missing.status, 'failed'); assert.equal(missing.exitCode, null);
  assert.match(missing.error, /ENOENT/); assert.equal(missing.cleanupConfirmed, true);
});

test('timeout escalates to SIGKILL for a child that ignores SIGTERM', async t => {
  const f = logsFixture(t);
  const result = await runVerification(command("process.on('SIGTERM',()=>{});setInterval(()=>{},1000)", { timeoutMs: 200 }), f);
  assert.equal(result.status, 'timed_out'); assert.equal(result.signal, 'SIGKILL');
  assert.equal(result.cleanupConfirmed, true); assert.equal(processAlive(result.childPid, true), false);
});

test('pre-aborted execution launches no child and active abort retains logs until confirmed exit', async t => {
  const f = logsFixture(t);
  const cancelled = await runVerification(command('throw Error("must not run")'), { ...f, signal: AbortSignal.abort(new Error('already stopped')) });
  assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.childPid, undefined); assert.equal(cancelled.cleanupConfirmed, true);
  const controller = new AbortController();
  const result = await runVerification(command('setInterval(()=>{},1000)'), { ...f, logDir: join(f.root, 'active'), signal: controller.signal, onSpawn: () => controller.abort(new Error('operator cancel')) });
  assert.equal(result.status, 'cancelled'); assert.match(result.error, /operator cancel/);
  assert.equal(result.cleanupConfirmed, true);
});

test('combined output limit bounds on-disk bytes, marks truncation and terminates the producer', async t => {
  const f = logsFixture(t);
  const result = await runVerification(command("setInterval(()=>{process.stdout.write('x'.repeat(800));process.stderr.write('y'.repeat(800));},1)", { maxOutputBytes: 1024 }), f);
  assert.equal(result.status, 'output_limit'); assert.equal(result.outputTruncated, true);
  assert.equal(statSync(result.stdoutPath).size + statSync(result.stderrPath).size, 1024);
  assert.ok(result.stdoutBytes + result.stderrBytes > 1024); assert.equal(result.cleanupConfirmed, true);
});

test('descendants keeping pipes open are killed even after the command parent exited with zero', async t => {
  const f = logsFixture(t), marker = join(f.root, 'descendant.pid');
  const childCode = `require('node:fs').writeFileSync(${JSON.stringify(marker)},String(process.pid));setInterval(()=>{},1000);`;
  const spec = command(`const c=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(childCode)}],{stdio:['ignore','inherit','inherit']});setTimeout(()=>process.exit(0),100);`);
  const result = await runVerification(spec, f);
  assert.equal(result.status, 'failed'); assert.equal(result.exitCode, 0);
  assert.match(result.error, /descendants/); assert.equal(result.cleanupConfirmed, true);
  const pid = Number(readFileSync(marker, 'utf8')); assert.equal(processAlive(pid), false);
});

if (process.platform === 'darwin') test('macOS denied group signal falls back to verified members and confirms cleanup', async t => {
  const f = logsFixture(t), controller = new AbortController();
  const kill = process.kill;
  let pid, denied = false;
  process.kill = function (target, signal) {
    if (target === -pid && signal !== 0) { denied = true; throw Object.assign(new Error('group denied'), { code: 'EPERM' }); }
    return kill.call(process, target, signal);
  };
  try {
    const result = await runVerification(command('setInterval(()=>{},1000)'), { ...f, signal: controller.signal, onSpawn: value => { pid = value.childPid; controller.abort(new Error('test-cancel')); } });
    assert.equal(denied, true); assert.equal(result.status, 'cancelled'); assert.equal(result.cleanupConfirmed, true);
  } finally { process.kill = kill; if (processAlive(pid)) kill.call(process, pid, 'SIGKILL'); }
});

test('command contract refuses shell fields, invalid deadlines, null bytes and implicit argv strings', () => {
  for (const spec of [{ command: 'node', shell: true }, { command: 'node', args: 'test.js' }, { command: 'node', args: ['bad\0arg'] }, { command: 'node', timeoutMs: 0 }]) assert.throws(() => verificationSchema.parse(spec));
});

test('verification runs in the managed worktree and persists log receipt without changing the source', async t => {
  const f = runtimeFixture(t), prepared = f.runtime.prepareWorkspace();
  const before = readFileSync(join(f.repo, '.git/index'));
  const spec = command("const fs=require('node:fs');if(fs.readFileSync('proof.txt','utf8')!=='baseline')process.exit(9);console.log(process.cwd());");
  const result = await f.runtime.verifyWorkspace(prepared.id, spec);
  assert.equal(result.status, 'passed'); assert.equal(result.baselineCommit, prepared.baseline.commit);
  assert.equal(readFileSync(result.stdoutPath, 'utf8').trim(), prepared.worktreePath);
  assert.ok(result.stdoutPath.startsWith(join(f.repo, '.codex-teams/verifications')));
  assert.equal(result.workspaceChanged, false); assert.equal(result.inputDigest, result.outputDigest);
  assert.equal(readFileSync(join(f.repo, 'proof.txt'), 'utf8'), 'baseline');
  assert.deepEqual(readFileSync(join(f.repo, '.git/index')), before);
  await f.reopen();
  assert.equal(f.runtime.workspaceStatus(prepared.id).verifications[0].status, 'passed');
  f.runtime.removeWorkspace(prepared.id);
  assert.equal(existsSync(result.stdoutPath), true, 'evidence remains after worktree cleanup');
});

test('command mutations are audited; exit-zero does not conceal source changes or accept an agent task', async t => {
  const f = runtimeFixture(t), prepared = f.runtime.prepareWorkspace();
  const result = await f.runtime.verifyWorkspace(prepared.id, command("require('node:fs').writeFileSync('proof.txt','command changed it')"));
  assert.equal(result.status, 'passed'); assert.equal(result.workspaceChanged, true);
  assert.notEqual(result.inputDigest, result.outputDigest);
  assert.deepEqual(f.runtime.workspaceStatus(prepared.id).lastInspection.changedPaths, ['proof.txt']);
  assert.equal(readFileSync(join(f.repo, 'proof.txt'), 'utf8'), 'baseline');
  assert.throws(() => f.runtime.removeWorkspace(prepared.id), /contains changes/);
  f.runtime.removeWorkspace(prepared.id, { discard: true });
});

test('active verification blocks cleanup, another check and members until cancellation completes', async t => {
  const f = runtimeFixture(t), prepared = f.runtime.prepareWorkspace();
  const running = f.runtime.verifyWorkspace(prepared.id, command('setInterval(()=>{},1000)'));
  await until(() => f.runtime.workspaceStatus(prepared.id).verifications?.[0].childPid);
  assert.throws(() => f.runtime.removeWorkspace(prepared.id, { discard: true }), /exit first/);
  await assert.rejects(f.runtime.verifyWorkspace(prepared.id, command('')), /exit first/);
  const task = f.runtime.create({ objective: 'Read proof', acceptance: ['Cite proof'] });
  assert.throws(() => f.runtime.start(task.id), /verification to exit/);
  const cancelled = await f.runtime.cancelVerification(prepared.id);
  assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.cleanupConfirmed, true);
  assert.deepEqual(await running, cancelled);
  f.runtime.removeWorkspace(prepared.id);
});

test('runtime shutdown cancels verification before releasing the SQLite owner', async t => {
  const f = runtimeFixture(t), prepared = f.runtime.prepareWorkspace();
  const running = f.runtime.verifyWorkspace(prepared.id, command('setInterval(()=>{},1000)'));
  await until(() => f.runtime.workspaceStatus(prepared.id).verifications[0].childPid);
  await f.runtime.close();
  const check = await running;
  assert.equal(check.status, 'cancelled'); assert.equal(check.cleanupConfirmed, true);
  await f.reopen();
  assert.equal(f.runtime.workspaceStatus(prepared.id).verifications[0].status, 'cancelled');
  f.runtime.removeWorkspace(prepared.id);
});

test('log root symlink and replaced worktree identity are refused before command execution', async t => {
  const f = runtimeFixture(t), prepared = f.runtime.prepareWorkspace();
  const outside = join(f.root, 'outside'); mkdirSync(outside);
  symlinkSync(outside, join(f.repo, '.codex-teams/verifications'));
  await assert.rejects(f.runtime.verifyWorkspace(prepared.id, command("require('node:fs').writeFileSync('marker','bad')")), /log root must not be a symlink/);
  assert.equal(existsSync(join(prepared.worktreePath, 'marker')), false);
  unlinkSync(join(f.repo, '.codex-teams/verifications'));
  assert.equal(existsSync(outside), true, 'Removing the link must preserve its target');
  const record = f.runtime.workspaceStatus(prepared.id); record.worktreePath = outside;
  f.runtime.store.saveWorkspace(record, 'forged-path');
  await assert.rejects(f.runtime.verifyWorkspace(prepared.id, command('')), /identity mismatch/);
  f.runtime.store.saveWorkspace(prepared, 'restore-path'); f.runtime.removeWorkspace(prepared.id);
});

test('recovery refuses a live orphan group; once exited it records interruption and never reruns the command', async t => {
  const f = runtimeFixture(t), prepared = f.runtime.prepareWorkspace();
  const orphan = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { detached: true, stdio: 'ignore' });
  t.after(() => { if (processAlive(orphan.pid)) orphan.kill('SIGKILL'); });
  const receipt = { id: 'injected', status: 'running', childPid: orphan.pid, cleanupConfirmed: false };
  const record = f.runtime.workspaceStatus(prepared.id); record.verifications = [receipt];
  f.runtime.store.saveWorkspace(record, 'injected-abrupt-exit'); await f.runtime.close();
  assert.throws(() => new TaskStore(join(f.repo, '.codex-teams/state.sqlite')), /live process group/);
  const exited = once(orphan, 'close'); orphan.kill('SIGKILL'); await exited;
  await f.reopen();
  const check = f.runtime.workspaceStatus(prepared.id).verifications[0];
  assert.equal(check.status, 'interrupted'); assert.equal(check.cleanupConfirmed, true);
  f.runtime.removeWorkspace(prepared.id);
});

test('CLI reports failed command with exit status one and handles SIGTERM while retaining the result', async t => {
  const f = runtimeFixture(t), prepared = f.runtime.prepareWorkspace();
  await f.runtime.close();
  const config = join(f.root, 'config.json'), spec = join(f.root, 'command.json');
  writeFileSync(config, JSON.stringify(f.config)); writeFileSync(spec, JSON.stringify(command('process.exit(6)')));
  const args = [resolve('src/cli.js'), 'workspace', 'verify', '--config', config, '--id', prepared.id, '--spec', spec];
  const failed = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 15000 });
  assert.equal(failed.status, 1); assert.equal(JSON.parse(failed.stdout).exitCode, 6);
  const marker = join(prepared.worktreePath, 'ready.pid');
  writeFileSync(spec, JSON.stringify(command("require('node:fs').writeFileSync('ready.pid',String(process.pid));setInterval(()=>{},1000)", { timeoutMs: 10000 })));
  const cli = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; cli.stdout.on('data', chunk => stdout += chunk);
  t.after(() => { if (processAlive(cli.pid)) cli.kill('SIGKILL'); });
  await until(() => existsSync(marker));
  const closed = once(cli, 'close'); cli.kill('SIGTERM');
  const [code] = await closed;
  assert.equal(code, 1); assert.equal(JSON.parse(stdout).status, 'cancelled');
  assert.equal(processAlive(Number(readFileSync(marker, 'utf8'))), false);
  await f.reopen();
  assert.equal(f.runtime.workspaceStatus(prepared.id).verifications.at(-1).cleanupConfirmed, true);
  f.runtime.removeWorkspace(prepared.id, { discard: true });
});

test('unconfirmed cleanup retains a blocking receipt and recovery never kills an old process group', async t => {
  const f = runtimeFixture(t), prepared = f.runtime.prepareWorkspace();
  const running = f.runtime.verifyWorkspace(prepared.id, command('setInterval(()=>{},1000)', { timeoutMs: 10000 }));
  await until(() => f.runtime.workspaceStatus(prepared.id).verifications[0].childPid);
  const pid = f.runtime.workspaceStatus(prepared.id).verifications[0].childPid;
  const kill = process.kill;
  process.kill = function (target, signal) {
    if (target === -pid && signal !== 0) throw Object.assign(new Error('injected signal denial'), { code: 'EACCES' });
    return kill.call(process, target, signal);
  };
  try {
    const result = await f.runtime.cancelVerification(prepared.id);
    assert.equal(result.status, 'recovery_required'); assert.equal(result.cleanupConfirmed, false);
    assert.match(result.cleanupError, /signal denial/);
    assert.throws(() => f.runtime.removeWorkspace(prepared.id, { discard: true }), /exit is unconfirmed/);
    await assert.rejects(f.runtime.verifyWorkspace(prepared.id, command('')), /exit is unconfirmed/);
    await f.runtime.close();
    assert.throws(() => new TaskStore(join(f.repo, '.codex-teams/state.sqlite')), /live process group/);
    assert.equal(processAlive(pid), true, 'recovery must not signal an old process');
  } finally {
    process.kill = kill;
    if (processAlive(pid, true)) kill.call(process, -pid, 'SIGKILL');
    await running;
  }
  await until(() => !processAlive(pid, true));
  await f.reopen();
  const check = f.runtime.workspaceStatus(prepared.id).verifications[0];
  assert.equal(check.cleanupConfirmed, true); assert.equal(check.status, 'recovery_required');
  f.runtime.removeWorkspace(prepared.id);
});
