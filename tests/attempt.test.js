import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { TaskRuntime } from '../src/runtime.js';
import { TaskStore, processAlive } from '../src/store.js';
import { CodexBackend } from '../src/app-server.js';
import { taskPrompt } from '../src/policy.js';
import { GitWorkspace } from '../src/workspace.js';

const acceptance = ['Cite proof.txt content'];
const report = value => ({ summary: 'Read baseline proof', criteria: [{ criterion: acceptance[0], satisfied: true, evidence: `proof.txt:1 ${value}` }], findings: [], blockers: [] });
const contract = spec => ({ objective: 'Read the captured proof baseline', acceptance, executionPlan: { verification: { command: process.execPath, args: ['-e', spec ?? "if(require('node:fs').readFileSync('proof.txt','utf8')!=='baseline')process.exit(7);console.log('verified')"], timeoutMs: 3000 } } });
async function until(predicate) {
  const deadline = Date.now() + 5000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error('Test condition timed out'); await delay(10); }
}
function setup(t, backend, overrides = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'teams-attempt-'))), repo = join(root, '源 repo'); mkdirSync(repo);
  const git = args => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: 'pipe' });
  git(['init', '-b', 'main']); git(['config', 'user.name', 'Test']); git(['config', 'user.email', 'test@localhost']);
  writeFileSync(join(repo, '.gitignore'), '.codex-teams/\ncoverage/\n'); writeFileSync(join(repo, 'proof.txt'), 'baseline');
  git(['add', '.']); git(['commit', '-m', 'initial']);
  const config = { workspace: repo, maxConcurrency: 2, taskTimeoutMs: 10000, profiles: { expert: { model: 'test-model', effort: 'high' } }, ...overrides };
  let runtime;
  const selected = backend ?? { run: async ({ cwd }) => ({ result: report(readFileSync(join(cwd, 'proof.txt'), 'utf8')) }) };
  const open = () => runtime = new TaskRuntime(new TaskStore(join(repo, '.codex-teams/state.sqlite')), selected, config);
  open();
  t.after(async () => { await runtime.close(); rmSync(root, { recursive: true, force: true }); });
  return { root, repo, config, git, get runtime() { return runtime; }, reopen: async () => { await runtime.close(); return open(); } };
}
async function runTask(f, input = contract()) {
  const task = f.runtime.create(input); f.runtime.start(task.id);
  return f.runtime.wait(task.id, 10000);
}
const pass = (runtime, task) => runtime.review({ taskId: task.id, attemptId: task.attempts.at(-1).id, verdict: 'pass', evidence: [{ criterion: acceptance[0], evidence: 'Captain inspected original proof content and verification log' }] });

test('one attempt binds a fresh worktree, real command and review evidence without changing the source', async t => {
  let memberCwd;
  const f = setup(t, { run: async ({ cwd }) => { memberCwd = cwd; return { result: report(readFileSync(join(cwd, 'proof.txt'), 'utf8')) }; } });
  const sourceIndex = readFileSync(join(f.repo, '.git/index'));
  const task = await runTask(f);
  assert.equal(task.status, 'awaiting_review');
  const attempt = task.attempts[0], workspace = f.runtime.workspaceStatus(attempt.workspaceId), check = workspace.verifications[0];
  assert.equal(memberCwd, workspace.worktreePath); assert.notEqual(memberCwd, f.repo);
  assert.deepEqual(workspace.binding, { taskId: task.id, attemptId: attempt.id });
  assert.equal(check.taskId, task.id); assert.equal(check.attemptId, attempt.id);
  assert.equal(check.id, attempt.verificationId); assert.equal(check.baselineCommit, attempt.baselineCommit);
  assert.equal(check.status, 'passed'); assert.equal(check.cleanupConfirmed, true);
  assert.equal(check.inputDigest, attempt.workspaceInputDigest); assert.equal(check.outputDigest, check.inputDigest);
  assert.throws(() => f.runtime.removeWorkspace(workspace.id), /Review or cancel/);
  await f.reopen();
  const reviewed = pass(f.runtime, f.runtime.status(task.id));
  assert.equal(reviewed.status, 'succeeded'); assert.equal(reviewed.review.verificationId, check.id);
  f.runtime.removeWorkspace(workspace.id);
  assert.equal(existsSync(check.stdoutPath), true);
  assert.equal(f.git(['rev-parse', 'HEAD']).trim(), attempt.baselineCommit);
  assert.deepEqual(readFileSync(join(f.repo, '.git/index')), sourceIndex);
});

test('worktree command uses the current attempt snapshot including explicit dirty baseline content', async t => {
  const f = setup(t);
  writeFileSync(join(f.repo, 'proof.txt'), 'user edit');
  const index = readFileSync(join(f.repo, '.git/index'));
  const input = contract("if(require('node:fs').readFileSync('proof.txt','utf8')!=='user edit')process.exit(7)");
  input.executionPlan.dirtyPolicy = 'snapshot';
  const task = await runTask(f, input);
  assert.equal(task.status, 'awaiting_review'); assert.match(task.result.criteria[0].evidence, /user edit/);
  assert.equal(readFileSync(join(f.repo, 'proof.txt'), 'utf8'), 'user edit');
  assert.deepEqual(readFileSync(join(f.repo, '.git/index')), index);
  pass(f.runtime, task); f.runtime.removeWorkspace(task.attempts[0].workspaceId);
});

test('default dirty rejection fails the attempt before spawning the member and retains its bound failure', async t => {
  let called = false;
  const f = setup(t, { run: async () => { called = true; throw Error('must not run'); } });
  writeFileSync(join(f.repo, 'proof.txt'), 'dirty');
  const task = await runTask(f);
  assert.equal(task.status, 'failed'); assert.match(task.error, /snapshot explicitly/); assert.equal(called, false);
  const workspace = f.runtime.workspaceStatus(task.attempts[0].workspaceId);
  assert.equal(workspace.status, 'failed'); assert.equal(workspace.binding.attemptId, task.attempts[0].id);
  f.runtime.removeWorkspace(workspace.id);
});

test('member blockers preserve their worktree and do not execute the verification command', async t => {
  const f = setup(t, { run: async () => ({ result: { ...report('baseline'), blockers: ['Need evidence'] } }) });
  const task = await runTask(f, contract("require('node:fs').writeFileSync('must-not-run','bad')"));
  assert.equal(task.status, 'blocked');
  const workspace = f.runtime.workspaceStatus(task.attempts[0].workspaceId);
  assert.equal(workspace.verifications, undefined); assert.equal(existsSync(join(workspace.worktreePath, 'must-not-run')), false);
  f.runtime.removeWorkspace(workspace.id);
});

test('verification failure preserves the member report but cannot pass review or unlock dependents', async t => {
  const f = setup(t), task = f.runtime.create(contract('process.exit(9)'));
  const dependent = f.runtime.create({ objective: 'Use reviewed proof', acceptance, dependencies: [task.id] });
  f.runtime.start(task.id); const failed = await f.runtime.wait(task.id, 10000);
  assert.equal(failed.status, 'failed'); assert.match(failed.result.criteria[0].evidence, /baseline/);
  const workspace = f.runtime.workspaceStatus(failed.attempts[0].workspaceId);
  assert.equal(workspace.verifications[0].exitCode, 9);
  assert.throws(() => pass(f.runtime, failed), /Stale review/);
  assert.throws(() => f.runtime.start(dependent.id), /Dependencies/);
  f.runtime.removeWorkspace(workspace.id);
});

test('read-only member changes stop verification before any command runs', async t => {
  const f = setup(t, { run: async ({ cwd }) => { writeFileSync(join(cwd, 'proof.txt'), 'unexpected member edit'); return { result: report('baseline') }; } });
  const task = await runTask(f, contract("require('node:fs').writeFileSync('must-not-run','bad')"));
  assert.equal(task.status, 'failed'); assert.match(task.error, /Read-only member workspace changed/);
  const workspace = f.runtime.workspaceStatus(task.attempts[0].workspaceId);
  assert.equal(workspace.verifications, undefined); assert.equal(existsSync(join(workspace.worktreePath, 'must-not-run')), false);
  f.runtime.removeWorkspace(workspace.id, { discard: true });
});

test('an exit-zero command that changes task inputs does not make the attempt reviewable', async t => {
  const f = setup(t), task = await runTask(f, contract("require('node:fs').writeFileSync('proof.txt','command edited')"));
  assert.equal(task.status, 'failed'); assert.match(task.error, /did not pass unchanged/);
  const workspace = f.runtime.workspaceStatus(task.attempts[0].workspaceId);
  assert.equal(workspace.verifications[0].status, 'passed'); assert.equal(workspace.verifications[0].workspaceChanged, true);
  f.runtime.removeWorkspace(workspace.id, { discard: true });
});

test('review refuses source edits after validation and cleanup remains blocked until explicit cancel', async t => {
  const f = setup(t), task = await runTask(f), workspace = f.runtime.workspaceStatus(task.attempts[0].workspaceId);
  writeFileSync(join(workspace.worktreePath, 'proof.txt'), 'later edit');
  assert.throws(() => pass(f.runtime, task), /Verified workspace changed/);
  assert.equal(f.runtime.status(task.id).status, 'awaiting_review');
  await f.runtime.cancel(task.id);
  f.runtime.removeWorkspace(workspace.id, { discard: true });
});

for (const mutation of ['modified', 'missing']) test(`review refuses ${mutation} command log evidence`, async t => {
  const f = setup(t), task = await runTask(f), workspace = f.runtime.workspaceStatus(task.attempts[0].workspaceId), check = workspace.verifications[0];
  if (mutation === 'modified') writeFileSync(check.stdoutPath, 'forged evidence'); else rmSync(check.stdoutPath);
  assert.throws(() => pass(f.runtime, task));
  assert.equal(f.runtime.status(task.id).status, 'awaiting_review');
  await f.runtime.cancel(task.id); f.runtime.removeWorkspace(workspace.id);
});

test('retry creates a new worktree and verification id; old review and old workspace cannot satisfy it', async t => {
  let calls = 0;
  const f = setup(t, { run: async () => ({ result: report(++calls === 1 ? 'first report' : 'second report') }) });
  const first = await runTask(f), old = first.attempts[0];
  f.runtime.review({ taskId: first.id, attemptId: old.id, verdict: 'reject', evidence: [{ criterion: acceptance[0], evidence: 'Need stronger original evidence' }] });
  f.runtime.start(first.id, { retry: true, reason: 'Read actual proof again' });
  const retried = await f.runtime.wait(first.id, 10000), current = retried.attempts[1];
  assert.equal(retried.status, 'awaiting_review', retried.error); assert.notEqual(current.workspaceId, old.workspaceId); assert.notEqual(current.verificationId, old.verificationId);
  assert.throws(() => f.runtime.review({ taskId: first.id, attemptId: old.id, verdict: 'pass', evidence: [{ criterion: acceptance[0], evidence: 'stale' }] }), /Stale review/);
  assert.equal(f.runtime.finish(first.id, old.id, 'succeeded', {}), false);
  assert.throws(() => f.runtime.saveWorkspaceRecord(f.runtime.workspaceStatus(old.workspaceId), 'late-write'), /Stale workspace attempt/);
  await assert.rejects(f.runtime.verifyWorkspace(old.workspaceId, contract().executionPlan.verification), /Bound workspaces/);
  f.runtime.removeWorkspace(old.workspaceId);
  pass(f.runtime, retried); f.runtime.removeWorkspace(current.workspaceId);
});

test('mismatched current-attempt verification receipt cannot pass review', async t => {
  const f = setup(t), task = await runTask(f), workspace = f.runtime.workspaceStatus(task.attempts[0].workspaceId);
  const actual = workspace.verifications[0].command;
  workspace.verifications[0].command = 'another-command'; f.runtime.store.saveWorkspace(workspace, 'injected-command-change');
  assert.throws(() => pass(f.runtime, task), /No current passed verification/);
  workspace.verifications[0].command = actual;
  workspace.verifications[0].attemptId = 'older-attempt'; f.runtime.store.saveWorkspace(workspace, 'injected-stale-receipt');
  assert.throws(() => pass(f.runtime, task), /No current passed verification/);
  await f.runtime.cancel(task.id); f.runtime.removeWorkspace(workspace.id);
});

test('cancelling a task during its command keeps it active until the bound process exits', async t => {
  const f = setup(t), task = f.runtime.create(contract('setInterval(()=>{},1000)'));
  f.runtime.start(task.id);
  await until(() => f.runtime.status(task.id).attempts[0].verificationId);
  const attempt = f.runtime.status(task.id).attempts[0], workspace = f.runtime.workspaceStatus(attempt.workspaceId);
  assert.throws(() => f.runtime.removeWorkspace(workspace.id, { discard: true }), /exit first/);
  const cancelled = await f.runtime.cancel(task.id);
  assert.equal(cancelled.status, 'cancelled');
  const check = f.runtime.workspaceStatus(workspace.id).verifications[0];
  assert.equal(check.status, 'cancelled'); assert.equal(check.cleanupConfirmed, true); assert.equal(processAlive(check.childPid, true), false);
  f.runtime.removeWorkspace(workspace.id);
});

test('the task deadline also covers its bound command and failed receipts cannot unlock a task', async t => {
  const f = setup(t, undefined, { taskTimeoutMs: 3000 });
  const input = contract('setInterval(()=>{},1000)'); input.executionPlan.verification.timeoutMs = 10000;
  const task = await runTask(f, input);
  assert.equal(task.status, 'cancelled'); assert.match(task.error, /Task deadline exceeded/);
  const workspace = f.runtime.workspaceStatus(task.attempts[0].workspaceId);
  assert.equal(workspace.verifications[0].status, 'cancelled'); assert.equal(workspace.verifications[0].cleanupConfirmed, true);
  f.runtime.removeWorkspace(workspace.id);
});

test('verified-worktree tasks are exclusive; ordinary read-only tasks retain their existing execution path', async t => {
  let cwd;
  const f = setup(t, { run: ({ cwd: path, signal }) => { cwd = path; return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })); } });
  const plain = f.runtime.create({ objective: 'Read main source', acceptance }); f.runtime.start(plain.id);
  assert.equal(cwd, f.repo);
  const verified = f.runtime.create(contract());
  assert.throws(() => f.runtime.start(verified.id), /run exclusively/);
  await f.runtime.cancel(plain.id);
  f.runtime.start(verified.id);
  assert.notEqual(cwd, f.repo);
  const other = f.runtime.create({ objective: 'Another read', acceptance });
  assert.throws(() => f.runtime.start(other.id), /run exclusively/);
  await f.runtime.cancel(verified.id);
  f.runtime.removeWorkspace(f.runtime.status(verified.id).attempts[0].workspaceId);
});

test('controlled App Server protocol fixture and CLI complete a bound attempt without calling a model', async t => {
  const fixture = fileURLToPath(new URL('./fixtures/fake-app-server.js', import.meta.url));
  const f = setup(t, new CodexBackend({ binary: process.execPath, args: [fixture], requestTimeoutMs: 1000 }));
  const task = await runTask(f);
  assert.equal(task.status, 'awaiting_review'); assert.equal(processAlive(task.attempts[0].childPid, true), false);
  pass(f.runtime, task); f.runtime.removeWorkspace(task.attempts[0].workspaceId);
  await f.runtime.close();
  const binary = join(f.root, 'fake codex');
  writeFileSync(binary, `#!/usr/bin/env node\nprocess.argv[2]='normal';await import(${JSON.stringify(new URL('./fixtures/fake-app-server.js', import.meta.url).href)});\n`, { mode: 0o755 });
  const config = join(f.root, 'config.json'), file = join(f.root, 'task.json');
  writeFileSync(config, JSON.stringify({ ...f.config, codexBin: binary })); writeFileSync(file, JSON.stringify(contract()));
  const cli = spawnSync(process.execPath, [resolve('src/cli.js'), 'run', '--config', config, '--task', file], { encoding: 'utf8', timeout: 10000 });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).status, 'awaiting_review');
  await f.reopen();
  const last = f.runtime.status().at(-1); await f.runtime.cancel(last.id); f.runtime.removeWorkspace(last.attempts[0].workspaceId);
});

test('task packet includes the explicit verification contract but not runtime ids or old logs', () => {
  const task = { ...contract(), context: [], kind: 'analysis', id: 'runtime-secret', attempts: [{ stdoutPath: 'secret-logs' }] };
  const prompt = taskPrompt(task, []);
  assert.match(prompt, /do not claim to have run it/); assert.match(prompt, /verification/);
  assert.ok(!prompt.includes('runtime-secret')); assert.ok(!prompt.includes('secret-logs'));
});

test('workspace binding transaction rolls back the task pointer when SQLite refuses the workspace row', async t => {
  const f = setup(t);
  f.runtime.store.db.exec("CREATE TEMP TRIGGER deny_workspace BEFORE INSERT ON workspaces BEGIN SELECT RAISE(ABORT, 'injected workspace write failure'); END");
  const task = await runTask(f);
  assert.equal(task.status, 'failed'); assert.match(task.error, /injected workspace write/);
  assert.equal(task.attempts[0].workspaceId, undefined);
  assert.deepEqual(f.runtime.workspaceStatus(), []);
  assert.equal(f.git(['worktree', 'list', '--porcelain']).split('worktree ').length - 1, 1);
});

test('a live member group blocks verification, retry and workspace deletion even after a backend report', async t => {
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { detached: true, stdio: 'ignore' });
  const f = setup(t, { run: async ({ onProgress }) => { onProgress({ childPid: child.pid }); return { result: report('baseline') }; } });
  try {
    const task = await runTask(f);
    assert.equal(task.status, 'failed'); assert.match(task.error, /Member process group exit is unconfirmed/);
    assert.throws(() => f.runtime.start(task.id, { retry: true, reason: 'unsafe duplicate' }), /Previous member.*exit is unconfirmed/);
    const workspace = f.runtime.workspaceStatus(task.attempts[0].workspaceId);
    assert.equal(workspace.verifications, undefined);
    assert.throws(() => f.runtime.removeWorkspace(workspace.id), /exit is unconfirmed/);
    const exited = once(child, 'close'); child.kill('SIGKILL'); await exited;
    await f.reopen();
    f.runtime.removeWorkspace(workspace.id);
  } finally { if (processAlive(child.pid)) child.kill('SIGKILL'); }
});

test('crash during a bound command preserves the atomic binding and refuses live orphan recovery', async t => {
  const f = setup(t), task = f.runtime.create(contract('setInterval(()=>{},1000)'));
  await f.runtime.close();
  const marker = join(f.root, 'command.pid');
  const runtimeUrl = new URL('../src/runtime.js', import.meta.url).href, storeUrl = new URL('../src/store.js', import.meta.url).href;
  const script = `import {TaskRuntime} from ${JSON.stringify(runtimeUrl)};import {TaskStore} from ${JSON.stringify(storeUrl)};
import {writeFileSync} from 'node:fs';
const runtime=new TaskRuntime(new TaskStore(${JSON.stringify(join(f.repo, '.codex-teams/state.sqlite'))}),{run:async()=>({result:${JSON.stringify(report('baseline'))}})},${JSON.stringify(f.config)});
runtime.start(${JSON.stringify(task.id)});
setInterval(()=>{const a=runtime.status(${JSON.stringify(task.id)}).attempts[0];if(!a.workspaceId)return;const c=runtime.workspaceStatus(a.workspaceId).verifications?.[0];if(c?.childPid){writeFileSync(${JSON.stringify(marker)},String(c.childPid));process.exit(7)}},10);`;
  const crashed = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 10000 });
  assert.equal(crashed.status, 7, crashed.stderr);
  const pid = Number(readFileSync(marker, 'utf8'));
  try { assert.throws(() => new TaskStore(join(f.repo, '.codex-teams/state.sqlite')), /live process group/); }
  finally { if (processAlive(pid, true)) process.kill(-pid, 'SIGKILL'); }
  await until(() => !processAlive(pid, true));
  await f.reopen();
  const interrupted = f.runtime.status(task.id), attempt = interrupted.attempts[0], workspace = f.runtime.workspaceStatus(attempt.workspaceId);
  assert.equal(interrupted.status, 'interrupted'); assert.equal(workspace.binding.attemptId, attempt.id);
  assert.equal(workspace.verifications[0].id, attempt.verificationId);
  assert.equal(workspace.verifications[0].status, 'interrupted'); assert.equal(workspace.verifications[0].cleanupConfirmed, true);
  assert.equal(interrupted.attempts.length, 1);
  f.runtime.removeWorkspace(workspace.id);
});


test('a synchronous preparation that exhausts the deadline never launches a member', async t => {
  let called = false;
  const f = setup(t, { run: async () => { called = true; return { result: report('baseline') }; } }, { taskTimeoutMs: 1000 });
  const prepare = GitWorkspace.prototype.prepare;
  GitWorkspace.prototype.prepare = function (...args) {
    const result = prepare.apply(this, args);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1100);
    return result;
  };
  let task;
  try { task = await runTask(f); }
  finally { GitWorkspace.prototype.prepare = prepare; }
  assert.equal(task.status, 'cancelled'); assert.match(task.error, /Task deadline exceeded/); assert.equal(called, false);
  const workspace = f.runtime.workspaceStatus(task.attempts[0].workspaceId);
  assert.equal(workspace.verifications, undefined); f.runtime.removeWorkspace(workspace.id);
});

test('verification-generated ignored output can pass unchanged-input review and requires explicit cleanup', async t => {
  const f = setup(t), task = await runTask(f, contract("const fs=require('node:fs');fs.mkdirSync('coverage');fs.writeFileSync('coverage/result.txt','generated');"));
  assert.equal(task.status, 'awaiting_review', task.error);
  const workspace = f.runtime.workspaceStatus(task.attempts[0].workspaceId);
  assert.equal(workspace.verifications[0].workspaceChanged, false);
  assert.equal(workspace.lastInspection.clean, false);
  assert.equal(pass(f.runtime, task).status, 'succeeded');
  assert.throws(() => f.runtime.removeWorkspace(workspace.id), /contains changes/);
  f.runtime.removeWorkspace(workspace.id, { discard: true });
});
