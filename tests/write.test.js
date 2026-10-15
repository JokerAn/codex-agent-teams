import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { TaskStore } from '../src/store.js';
import { TaskRuntime } from '../src/runtime.js';
import { GitWorkspace } from '../src/workspace.js';
import { taskSchema } from '../src/contracts.js';
import { CodexBackend } from '../src/app-server.js';

const acceptance = ['sum returns the sum of its arguments'];
const input = () => ({ objective: 'Fix sum in sum.js', kind: 'implementation', mode: 'workspace-write', acceptance,
  executionPlan: { dirtyPolicy: 'snapshot', allowedPaths: ['sum.js'], verification: { command: process.execPath, args: ['--test', 'sum.test.js'], timeoutMs: 3000 } } });
const report = (satisfied = true) => ({ summary: 'Reviewed sum implementation', criteria: [{ criterion: acceptance[0], satisfied, evidence: 'sum.js:1 uses a + b; sum.test.js asserts sum(2,3) is 5' }], findings: [], blockers: [] });
const approve = (runtime, task) => runtime.review({ taskId: task.id, attemptId: task.attempts.at(-1).id, verdict: 'pass', evidence: [{ criterion: acceptance[0], evidence: 'Captain inspected sum.js and the passing test log, plus independent expert review' }] });
function fixture(t, options = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'teams-write-'))), repo = join(root, 'repo'); mkdirSync(repo);
  const git = args => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: 'pipe' });
  git(['init', '-b', 'main']); git(['config', 'user.name', 'Test']); git(['config', 'user.email', 'test@localhost']);
  writeFileSync(join(repo, '.gitignore'), '.codex-teams/\nignored.txt\n');
  writeFileSync(join(repo, 'sum.js'), 'export const sum = (a, b) => a - b;\n');
  writeFileSync(join(repo, 'package.json'), '{"type":"module"}');
  writeFileSync(join(repo, 'sum.test.js'), "import test from 'node:test';import assert from 'node:assert/strict';import {sum} from './sum.js';test('sum',()=>assert.equal(sum(2,3),5));\n");
  writeFileSync(join(repo, 'user.txt'), 'user baseline\n');
  git(['add', '.']); git(['commit', '-m', 'initial']);
  const roles = [];
  const backend = options.backend ?? { run: async request => {
    roles.push({ role: request.role ?? 'member', mode: request.mode, cwd: request.cwd, model: request.selection.model });
    if (request.role === 'review') {
      assert.equal(request.mode, 'read-only'); assert.match(request.prompt, /diff --git/);
      if (options.reviewMutate) writeFileSync(join(request.cwd, 'sum.js'), 'tampered by reviewer');
      if (options.reviewReject) return { result: report(false), actualModel: request.selection.model };
    } else {
      assert.equal(request.mode, 'workspace-write');
      writeFileSync(join(request.cwd, 'sum.js'), 'export const sum = (a, b) => a + b;\n');
      if (options.ignored) writeFileSync(join(request.cwd, 'ignored.txt'), 'ignored scope escape');
      if (options.outside) writeFileSync(join(request.cwd, 'extra.txt'), 'out of scope');
      if (options.commit) {
        execFileSync('git', ['-C', request.cwd, 'add', '.'], { stdio: 'pipe' });
        execFileSync('git', ['-C', request.cwd, 'commit', '-m', 'unexpected'], { stdio: 'pipe' });
      }
    }
    return { result: report(), actualModel: request.selection.model, usage: { total: { totalTokens: 10 } } };
  } };
  const config = { workspace: repo, maxConcurrency: 2, taskTimeoutMs: 15000, profiles: { expert: { model: 'test-model', effort: 'high' } } };
  let runtime;
  const open = () => runtime = new TaskRuntime(new TaskStore(join(repo, '.codex-teams/state.sqlite')), backend, config);
  open();
  t.after(async () => { await runtime.close(); rmSync(root, { recursive: true, force: true }); });
  return { root, repo, git, roles, config, get runtime() { return runtime; }, reopen: async () => { await runtime.close(); return open(); } };
}
async function execute(f, spec = input()) {
  const task = f.runtime.create(spec); f.runtime.start(task.id); return f.runtime.wait(task.id, 15000);
}
async function integrate(f, task) {
  f.runtime.integrate(task.id, task.attempts.at(-1).id); return f.runtime.wait(task.id, 15000);
}

test('deadline crossed in either synchronous evidence check cannot launch review or submit success', async t => {
  for (const slowCall of [1, 2]) await t.test(`evidence check ${slowCall}`, async t => {
    const f = fixture(t);
    let offset = 0, calls = 0;
    const now = Date.now, evidence = GitWorkspace.prototype.candidateEvidence;
    t.mock.method(Date, 'now', () => now() + offset);
    t.mock.method(GitWorkspace.prototype, 'candidateEvidence', function (...args) {
      const patch = evidence.apply(this, args);
      if (++calls === slowCall) offset += f.config.taskTimeoutMs + 100;
      return patch;
    });
    const task = await execute(f);
    assert.equal(task.status, 'timed_out', task.error);
    assert.equal(f.roles.filter(role => role.role === 'review').length, slowCall === 1 ? 0 : 1);
    assert.equal(task.failure.code, 'task_deadline_exceeded');
  });
});

test('file/directory conversions complete runtime review, integration and source verification with user staging intact', async t => {
  for (const beforeDirectory of [false, true]) await t.test(String(beforeDirectory), async t => {
    const criteria = ['entry has the expected converted bytes'];
    const f = fixture(t, { backend: { run: async request => {
      if (request.role !== 'review') {
        const entry = join(request.cwd, 'entry'); rmSync(entry, { recursive: true, force: true });
        if (!beforeDirectory) mkdirSync(entry);
        writeFileSync(beforeDirectory ? entry : join(entry, 'index.js'), 'converted');
      }
      return { actualModel: request.selection.model, result: { summary: 'fixture conversion', criteria: [{ criterion: criteria[0], satisfied: true, evidence: 'entry conversion fixture' }], findings: [], blockers: [] } };
    } } });
    const entry = join(f.repo, 'entry'); if (beforeDirectory) mkdirSync(entry);
    writeFileSync(beforeDirectory ? join(entry, 'index.js') : entry, 'baseline');
    f.git(['add', 'entry']); f.git(['commit', '-m', 'entry baseline']);
    writeFileSync(join(f.repo, 'user.txt'), 'staged user\n'); f.git(['add', 'user.txt']);
    writeFileSync(join(f.repo, 'user.txt'), 'staged user\nunstaged user\n');
    const head = f.git(['rev-parse', 'HEAD']), index = readFileSync(join(f.repo, '.git/index'));
    const task = await execute(f, { objective: 'Convert entry shape', kind: 'implementation', mode: 'workspace-write', acceptance: criteria,
      executionPlan: { dirtyPolicy: 'snapshot', allowedPaths: ['entry'], verification: { command: process.execPath,
        args: ['-e', "if(require('node:fs').readFileSync(process.argv[1],'utf8')!=='converted')process.exit(1)", beforeDirectory ? 'entry' : 'entry/index.js'] } } });
    assert.equal(task.status, 'awaiting_review', task.error);
    const reviewed = f.runtime.review({ taskId: task.id, attemptId: task.attempts[0].id, verdict: 'pass', evidence: criteria.map(criterion => ({ criterion, evidence: 'captain checked conversion and command' })) });
    const result = await integrate(f, reviewed);
    assert.equal(result.status, 'succeeded', result.error);
    assert.equal(result.attempts[0].integration.status, 'passed');
    assert.equal(f.git(['rev-parse', 'HEAD']), head); assert.deepEqual(readFileSync(join(f.repo, '.git/index')), index);
    assert.equal(readFileSync(join(f.repo, 'user.txt'), 'utf8'), 'staged user\nunstaged user\n');
    f.runtime.removeWorkspace(task.attempts[0].workspaceId, { discard: true });
  });
});

test('write contract requires expert, explicit paths and verification; reserved/escaping paths are refused', () => {
  for (const bad of [{ ...input(), executionPlan: undefined }, { ...input(), profile: 'qualified' }, { ...input(), executionPlan: { ...input().executionPlan, allowedPaths: ['../other'] } }, { ...input(), executionPlan: { ...input().executionPlan, allowedPaths: ['.git/config'] } }, { ...input(), executionPlan: { ...input().executionPlan, allowedPaths: [] } }]) assert.throws(() => taskSchema.parse(bad));
});

test('write -> real verification -> fresh expert review -> captain -> explicit integration -> source test', async t => {
  const f = fixture(t), head = f.git(['rev-parse', 'HEAD']), originalIndex = readFileSync(join(f.repo, '.git/index'));
  const task = await execute(f);
  assert.equal(task.status, 'awaiting_review', task.error);
  assert.deepEqual(f.roles.map(role => [role.role, role.mode]), [['member', 'workspace-write'], ['review', 'read-only']]);
  assert.notEqual(f.roles[0].cwd, f.repo); assert.equal(f.roles[0].cwd, f.roles[1].cwd);
  assert.match(readFileSync(join(f.repo, 'sum.js'), 'utf8'), /a - b/);
  assert.deepEqual(task.attempts[0].phases.map(phase => phase.phase), ['preparing','preflight','member','auditing','verification','independent_review','awaiting_review']);
  const attempt = task.attempts[0]; assert.equal(attempt.machineReview.status, 'passed');
  assert.equal(attempt.machineReview.actualModel, 'test-model'); assert.ok(existsSync(attempt.candidate.patchPath));
  const dependent = f.runtime.create({ objective: 'Read integrated sum', acceptance: ['cite sum'], dependencies: [task.id] });
  assert.throws(() => f.runtime.start(dependent.id), /Dependencies/);
  // A new user choice cannot retroactively change this attempt's reviewer.
  f.runtime.confirmModels({ expert: { model: 'new-expert' } }, 'mcp-elicitation');
  const reviewed = approve(f.runtime, task);
  assert.equal(reviewed.status, 'awaiting_integration'); assert.throws(() => f.runtime.start(dependent.id), /Dependencies/);
  assert.throws(() => f.runtime.integrate(task.id, 'old-attempt'), /current captain-approved/);
  await f.reopen();
  f.runtime.confirmModels({ expert: { model: 'another-expert' } }, 'mcp-elicitation');
  const integrated = await integrate(f, reviewed);
  assert.equal(integrated.status, 'succeeded', integrated.error); assert.equal(integrated.attempts[0].integration.status, 'passed');
  assert.deepEqual(integrated.attempts[0].phases.slice(-4).map(phase => phase.phase), ['awaiting_integration','applying','integration_verification','succeeded']);
  assert.match(readFileSync(join(f.repo, 'sum.js'), 'utf8'), /a \+ b/);
  assert.deepEqual(readFileSync(join(f.repo, '.git/index')), originalIndex); assert.equal(f.git(['rev-parse', 'HEAD']), head);
  assert.equal(f.runtime.workspaceStatus(attempt.workspaceId).verifications.length, 2);
  assert.throws(() => f.runtime.integrate(task.id, attempt.id), /current captain-approved/);
  f.runtime.removeWorkspace(attempt.workspaceId, { discard: true });
  assert.match(readFileSync(join(f.repo, 'sum.js'), 'utf8'), /a \+ b/);
});

test('dirty snapshot integration preserves user staged and unstaged files and exact source index', async t => {
  const f = fixture(t);
  writeFileSync(join(f.repo, 'user.txt'), 'staged user\n'); f.git(['add', 'user.txt']); writeFileSync(join(f.repo, 'user.txt'), 'staged plus unstaged\n');
  writeFileSync(join(f.repo, 'sum.js'), '// user comment\nexport const sum = (a,b) => a-b;\n');
  const index = readFileSync(join(f.repo, '.git/index'));
  const task = await execute(f); assert.equal(task.status, 'awaiting_review', task.error); approve(f.runtime, task);
  const done = await integrate(f, task); assert.equal(done.status, 'succeeded', done.error);
  assert.equal(readFileSync(join(f.repo, 'user.txt'), 'utf8'), 'staged plus unstaged\n');
  assert.deepEqual(readFileSync(join(f.repo, '.git/index')), index);
  f.runtime.removeWorkspace(task.attempts[0].workspaceId, { discard: true });
});

for (const option of ['outside', 'ignored', 'commit']) test(`member ${option} violation fails before expert review or integration`, async t => {
  const f = fixture(t, { [option]: true }), task = await execute(f);
  assert.equal(task.status, 'failed'); assert.match(task.error, option !== 'commit' ? /scope exceeded/ : /changed HEAD/);
  assert.equal(f.roles.length, 1); assert.throws(() => approve(f.runtime, task), /Stale review/);
  assert.match(readFileSync(join(f.repo, 'sum.js'), 'utf8'), /a - b/);
  f.runtime.removeWorkspace(task.attempts[0].workspaceId, { discard: true });
});

for (const option of ['reviewReject', 'reviewMutate']) test(`independent reviewer ${option} prevents captain acceptance`, async t => {
  const f = fixture(t, { [option]: true }), task = await execute(f);
  assert.equal(task.status, 'failed', task.error); assert.equal(f.roles.length, 2);
  assert.throws(() => approve(f.runtime, task), /Stale review/);
  assert.match(readFileSync(join(f.repo, 'sum.js'), 'utf8'), /a - b/);
  f.runtime.removeWorkspace(task.attempts[0].workspaceId, { discard: true });
});

test('changed source is refused without clobbering edits or applying any patch', async t => {
  const f = fixture(t), task = await execute(f); approve(f.runtime, task);
  writeFileSync(join(f.repo, 'sum.js'), 'concurrent user edit\n');
  assert.throws(() => f.runtime.integrate(task.id, task.attempts[0].id), /Source workspace changed/);
  assert.equal(readFileSync(join(f.repo, 'sum.js'), 'utf8'), 'concurrent user edit\n');
  assert.equal(f.runtime.status(task.id).status, 'awaiting_integration');
  await f.runtime.cancel(task.id); f.runtime.removeWorkspace(task.attempts[0].workspaceId, { discard: true });
});

test('candidate patch tampering is rejected before review or integration', async t => {
  const f = fixture(t), task = await execute(f), attempt = task.attempts[0];
  writeFileSync(attempt.candidate.patchPath, 'forged patch');
  assert.throws(() => approve(f.runtime, task), /patch evidence changed/);
  await f.runtime.cancel(task.id); f.runtime.removeWorkspace(attempt.workspaceId, { discard: true });
});

test('post-integration verification failure retains applied changes and blocks false success', async t => {
  const f = fixture(t), spec = input();
  spec.executionPlan.verification.args = ['-e', "if(!process.cwd().includes('/worktrees/'))process.exit(8)"];
  const task = await execute(f, spec); assert.equal(task.status, 'awaiting_review', task.error); approve(f.runtime, task);
  const failed = await integrate(f, task); assert.equal(failed.status, 'integration_failed');
  assert.match(readFileSync(join(f.repo, 'sum.js'), 'utf8'), /a \+ b/);
  assert.equal(failed.attempts[0].integration.status, 'recovery_required');
  assert.equal(f.runtime.workspaceStatus(task.attempts[0].workspaceId).verifications.at(-1).exitCode, 8);
  assert.throws(() => f.runtime.integrate(task.id, task.attempts[0].id), /current captain-approved/);
  f.runtime.removeWorkspace(task.attempts[0].workspaceId, { discard: true });
});

test('crash after patch application becomes integration_failed and never automatically reapplies', async t => {
  const f = fixture(t), task = await execute(f); approve(f.runtime, task); await f.runtime.close();
  const runtimeUrl = new URL('../src/runtime.js', import.meta.url).href, storeUrl = new URL('../src/store.js', import.meta.url).href, gitUrl = new URL('../src/workspace.js', import.meta.url).href;
  const code = `import {TaskRuntime} from ${JSON.stringify(runtimeUrl)};import {TaskStore} from ${JSON.stringify(storeUrl)};import {GitWorkspace} from ${JSON.stringify(gitUrl)};
const apply=GitWorkspace.prototype.applyCandidate;GitWorkspace.prototype.applyCandidate=function(...args){apply.apply(this,args);process.exit(7)};
const runtime=new TaskRuntime(new TaskStore(${JSON.stringify(join(f.repo, '.codex-teams/state.sqlite'))}),{},${JSON.stringify(f.config)});runtime.integrate(${JSON.stringify(task.id)},${JSON.stringify(task.attempts[0].id)});`;
  const crashed = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 10000 }); assert.equal(crashed.status, 7, crashed.stderr);
  await f.reopen(); const recovered = f.runtime.status(task.id);
  assert.equal(recovered.status, 'integration_failed'); assert.equal(recovered.attempts[0].integration.status, 'recovery_required');
  assert.equal(recovered.attempts[0].endedAt, task.attempts[0].endedAt);
  assert.ok(recovered.attempts[0].recoveryObservedAt);
  assert.equal(recovered.attempts[0].integration.endedAt, undefined);
  assert.equal(recovered.attempts[0].phase, 'integration_failed');
  assert.match(readFileSync(join(f.repo, 'sum.js'), 'utf8'), /a \+ b/);
  assert.throws(() => f.runtime.integrate(task.id, task.attempts[0].id), /current captain-approved/);
  f.runtime.removeWorkspace(task.attempts[0].workspaceId, { discard: true });
});

test('binary additions and deletions integrate through a Git patch and preserve original source staging', async t => {
  const f = fixture(t, { backend: { run: async req => {
    if (req.role !== 'review') { rmSync(join(req.cwd, 'user.txt')); writeFileSync(join(req.cwd, 'new.bin'), Buffer.from([0,255,3,10])); }
    return { result: report(), actualModel: req.selection.model };
  } } });
  const spec = input(); spec.executionPlan.allowedPaths = ['user.txt', 'new.bin']; spec.executionPlan.verification.args = ['-e', "const fs=require('node:fs');if(fs.existsSync('user.txt')||fs.readFileSync('new.bin')[1]!==255)process.exit(1)"];
  const index = readFileSync(join(f.repo, '.git/index'));
  const task = await execute(f, spec); assert.equal(task.status, 'awaiting_review', task.error); approve(f.runtime, task);
  const done = await integrate(f, task); assert.equal(done.status, 'succeeded', done.error);
  assert.equal(existsSync(join(f.repo, 'user.txt')), false); assert.deepEqual(readFileSync(join(f.repo, 'new.bin')), Buffer.from([0,255,3,10]));
  assert.deepEqual(readFileSync(join(f.repo, '.git/index')), index);
  f.runtime.removeWorkspace(task.attempts[0].workspaceId, { discard: true });
});

test('App Server enforces write permission echo and reviewer receives read-only permission', async t => {
  const f = fixture(t), fixturePath = resolve('tests/fixtures/fake-app-server.js');
  const backend = new CodexBackend({ binary: process.execPath, args: [fixturePath, 'write'], requestTimeoutMs: 1000 });
  const controller = new AbortController();
  const result = await backend.run({ cwd: f.repo, selection: f.config.profiles.expert, acceptance, prompt: JSON.stringify({ acceptance }), signal: controller.signal, mode: 'workspace-write' });
  assert.equal(result.actualModel, 'test-model');
  await assert.rejects(new CodexBackend({ binary: process.execPath, args: [fixturePath, 'unsafe-write'], requestTimeoutMs: 1000 }).run({ cwd: f.repo, selection: f.config.profiles.expert, acceptance, prompt: JSON.stringify({ acceptance }), signal: controller.signal, mode: 'workspace-write' }), /did not confirm/);
});

for (const captainModels of [false, true]) test(`MCP write contract -> asynchronous integration with ${captainModels ? 'explicit captain models without forms' : 'human preferences'}`, async t => {
  const { Client } = await import('@modelcontextprotocol/client');
  const { StdioClientTransport } = await import('@modelcontextprotocol/client/stdio');
  const f = fixture(t); await f.runtime.close();
  const binary = join(f.root, 'fake-write-codex');
  const fixturePath = new URL('./fixtures/fake-app-server.js', import.meta.url).href;
  writeFileSync(binary, `#!/usr/bin/env node\nprocess.argv[2]='write-runtime';await import(${JSON.stringify(fixturePath)});\n`, { mode: 0o755 });
  const config = join(f.root, 'config.json'); writeFileSync(config, JSON.stringify({ ...f.config, codexBin: binary }));
  const client = new Client({ name: 'write-tools', version: '0.1.0' }, { capabilities: captainModels ? {} : { elicitation: { form: {} } } });
  if (!captainModels) client.setRequestHandler('elicitation/create', async () => ({ action: 'accept', content: {
    expert: JSON.stringify({ model: 'test-model', effort: 'high' }),
    simple: JSON.stringify({ model: 'configured-model', effort: 'high' }), confirm: true, remember: false,
  } }));
  t.after(() => client.close());
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve('src/cli.js'), 'mcp', '--config', config], stderr: 'pipe' }));
  const call = async (name, args) => { const response = await client.callTool({ name, arguments: args }); assert.ok(!response.isError, JSON.stringify(response.content)); return JSON.parse(response.content[0].text); };
  const tools = (await client.listTools()).tools; assert.equal(tools.length, 8);
  assert.equal(tools.find(tool => tool.name === 'teams_integrate').annotations.destructiveHint, true);
  if (!captainModels) await call('teams_models', { confirm: true });
  const task = await call('teams_create', { expectedWorkspace: f.repo, ...input(), complexity: 'simple' });
  await call('teams_start', { taskId: task.id, ...(captainModels ? { models: { expert: { model: 'test-model', effort: 'high' }, simple: { model: 'configured-model', effort: 'high' } } } : {}) });
  const ready = await call('teams_wait', { taskId: task.id, timeoutMs: 30000, verbose: true }); assert.equal(ready.status, 'awaiting_review', ready.error);
  const attempt = ready.attempts[0];
  assert.equal(attempt.actualModel, 'configured-model');
  assert.equal(attempt.machineReview.actualModel, 'test-model');
  if (captainModels) {
    assert.equal(attempt.dispatch.source, 'captain-explicit');
    assert.equal(attempt.modelConfirmation, undefined);
  } else assert.equal(attempt.modelConfirmation.source, 'mcp-elicitation');
  assert.notEqual(attempt.threadId, attempt.machineReview.threadId);
  const approved = await call('teams_review', { taskId: task.id, attemptId: attempt.id, verdict: 'pass', evidence: [{ criterion: acceptance[0], evidence: 'Controlled fixture patch and independent fixture report + real sum tests checked' }] });
  assert.equal(approved.status, 'awaiting_integration');
  await call('teams_integrate', { taskId: task.id, attemptId: attempt.id });
  assert.equal((await call('teams_wait', { taskId: task.id, timeoutMs: 30000 })).status, 'succeeded');
  await call('teams_cancel', { taskId: task.id, cleanup: true, discard: true });
  assert.equal((await call('teams_status', { taskId: task.id })).status, 'succeeded');
  await client.close(); await f.reopen(); assert.equal(f.runtime.workspaceStatus(attempt.workspaceId).status, 'removed');
});

test('a reviewer exception is recorded with its process metadata and never causes integration', async t => {
  let count = 0;
  const f = fixture(t, { backend: { run: async req => {
    if (++count === 1) { writeFileSync(join(req.cwd, 'sum.js'), 'export const sum=(a,b)=>a+b;\n'); return { result: report(), actualModel: 'test-model' }; }
    req.onProgress({ childPid: undefined, threadId: 'review-failed' }); throw new Error('review connection failed');
  } } });
  const task = await execute(f); assert.equal(task.status, 'failed'); assert.match(task.error, /review connection failed/);
  assert.equal(task.attempts[0].machineReview.threadId, 'review-failed'); assert.equal(task.attempts[0].cleanupConfirmed, true);
  f.runtime.removeWorkspace(task.attempts[0].workspaceId, { discard: true });
});

test('failed but live reviewer blocks every new task until its exit is confirmed on reopen', async t => {
  const { spawn } = await import('node:child_process'), { once } = await import('node:events');
  const { processAlive } = await import('../src/store.js');
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { detached: true, stdio: 'ignore' });
  const f = fixture(t, { backend: { run: async req => {
    if (req.role !== 'review') { writeFileSync(join(req.cwd, 'sum.js'), 'export const sum=(a,b)=>a+b;\n'); return { result: report(), actualModel: 'test-model' }; }
    req.onProgress({ childPid: child.pid }); throw new Error('review cleanup failed');
  } } });
  try {
    const task = await execute(f); assert.equal(task.status, 'failed'); assert.equal(task.attempts[0].cleanupConfirmed, false);
    const other = f.runtime.create({ objective: 'Read another file', acceptance: ['cite file'] });
    assert.throws(() => f.runtime.start(other.id), /exit is unconfirmed/);
    await f.runtime.close(); assert.throws(() => new TaskStore(join(f.repo, '.codex-teams/state.sqlite')), /live child\/reviewer/);
    const exited = once(child, 'close'); child.kill('SIGKILL'); await exited;
    await f.reopen(); assert.equal(f.runtime.status(task.id).attempts[0].cleanupConfirmed, true);
    f.runtime.removeWorkspace(task.attempts[0].workspaceId, { discard: true });
  } finally { if (processAlive(child.pid)) child.kill('SIGKILL'); }
});

test('integration cancellation waits for source verification exit and retains the applied patch', async t => {
  const f = fixture(t), spec = input();
  spec.executionPlan.verification.args = ['-e', "if(!process.cwd().includes('/worktrees/'))setInterval(()=>{},1000)"];
  const task = await execute(f, spec); approve(f.runtime, task);
  f.runtime.integrate(task.id, task.attempts[0].id);
  const cancelled = await f.runtime.cancel(task.id);
  assert.equal(cancelled.status, 'integration_failed');
  assert.match(readFileSync(join(f.repo, 'sum.js'), 'utf8'), /a \+ b/);
  const last = f.runtime.workspaceStatus(task.attempts[0].workspaceId).verifications.at(-1);
  assert.equal(last.phase, 'integration'); assert.equal(last.status, 'cancelled'); assert.equal(last.cleanupConfirmed, true);
  f.runtime.removeWorkspace(task.attempts[0].workspaceId, { discard: true });
});

test('staging-only source drift also refuses integration while preserving the user index', async t => {
  const f = fixture(t), task = await execute(f); approve(f.runtime, task);
  f.git(['update-index', '--assume-unchanged', 'user.txt']);
  const index = readFileSync(join(f.repo, '.git/index'));
  assert.throws(() => f.runtime.integrate(task.id, task.attempts[0].id));
  assert.deepEqual(readFileSync(join(f.repo, '.git/index')), index);
  assert.match(readFileSync(join(f.repo, 'sum.js'), 'utf8'), /a - b/);
  await f.runtime.cancel(task.id); f.git(['update-index', '--no-assume-unchanged', 'user.txt']);
  f.runtime.removeWorkspace(task.attempts[0].workspaceId, { discard: true });
});

test('independent reviewer cannot reuse the writer thread or substitute an unapproved model', async t => {
  const f = fixture(t, { backend: { run: async req => {
    if (req.role !== 'review') writeFileSync(join(req.cwd, 'sum.js'), 'export const sum=(a,b)=>a+b;\n');
    return { result: report(), actualModel: req.selection.model, threadId: 'reused-thread' };
  } } });
  const task = await execute(f); assert.equal(task.status, 'failed'); assert.match(task.error, /fresh thread/);
  f.runtime.removeWorkspace(task.attempts[0].workspaceId, { discard: true });
});


test('integration that exhausts its deadline during synchronous apply does not launch a source command', async t => {
  const f = fixture(t), task = await execute(f); approve(f.runtime, task);
  f.runtime.config.taskTimeoutMs = 1000;
  const apply = GitWorkspace.prototype.applyCandidate;
  GitWorkspace.prototype.applyCandidate = function (...args) {
    const digest = apply.apply(this, args);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1100);
    return digest;
  };
  let failed;
  try { failed = await integrate(f, task); }
  finally { GitWorkspace.prototype.applyCandidate = apply; }
  assert.equal(failed.status, 'integration_failed'); assert.match(failed.error, /Integration deadline exceeded/);
  assert.match(readFileSync(join(f.repo, 'sum.js'), 'utf8'), /a \+ b/);
  assert.equal(f.runtime.workspaceStatus(task.attempts[0].workspaceId).verifications.length, 1);
  f.runtime.removeWorkspace(task.attempts[0].workspaceId, { discard: true });
});

test('crash before member PID persistence remains blocked rather than silently replaying an unknown launch', async t => {
  const f = fixture(t), task = f.runtime.create(input());
  task.status = 'running'; task.attempts = [{ id: 'unknown-launch', status: 'running', memberLaunch: 'starting' }];
  f.runtime.store.save(task, 'injected-early-crash'); await f.runtime.close();
  assert.throws(() => new TaskStore(join(f.repo, '.codex-teams/state.sqlite')), /unknown member\/reviewer launch identity/);
  // Only remove the injection after independent test confirmation that no process was ever launched.
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(join(f.repo, '.codex-teams/state.sqlite'));
  const record = JSON.parse(db.prepare('SELECT data FROM tasks WHERE id=?').get(task.id).data);
  assert.equal(record.attempts.length, 1); assert.equal(record.status, 'running');
  record.attempts[0].memberLaunch = 'exited'; db.prepare('UPDATE tasks SET data=? WHERE id=?').run(JSON.stringify(record), task.id); db.close();
  await f.reopen(); assert.equal(f.runtime.status(task.id).status, 'interrupted');
});
