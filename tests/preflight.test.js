import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { workspaceIdentity, assertWorkspace } from '../src/workspace.js';
import { inspectExecution } from '../src/preflight.js';
import { TaskRuntime } from '../src/runtime.js';
import { TaskStore } from '../src/store.js';
import { validateModelSelection, modelPolicyVersion } from '../src/models.js';
import { readSnapshot, overview, renderText, renderHtml } from '../src/status.js';

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'teams-preflight-'))), repo = join(root, 'repo');
  mkdirSync(repo);
  const git = args => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: 'pipe' });
  git(['init', '-b', 'main']); git(['config', 'user.name', 'Test']); git(['config', 'user.email', 'test@localhost']);
  writeFileSync(join(repo, '.gitignore'), '.codex-teams/\nnode_modules/\n');
  writeFileSync(join(repo, 'proof.txt'), 'baseline'); git(['add', '.']); git(['commit', '-m', 'baseline']);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, repo, git };
}
const contract = { objective: 'Inspect proof', acceptance: ['Cite proof'] };
const profiles = { expert: { model: 'test', effort: 'high' } };
const catalog = { models: [{ model: 'test', efforts: ['high'] }] };

test('identity distinguishes linked worktrees, accepts equivalent symlink and rejects copied preferences', t => {
  const f = fixture(t), linked = join(f.root, 'linked'), alias = join(f.root, 'alias');
  f.git(['worktree', 'add', '--detach', linked]); symlinkSync(f.repo, alias, 'dir');
  const identity = workspaceIdentity(f.repo);
  assertWorkspace(alias, identity);
  assert.equal(workspaceIdentity(linked).commonDir, identity.commonDir);
  assert.throws(() => assertWorkspace(identity, workspaceIdentity(linked)), /identity changed/);
  const selection = { profiles, source: 'mcp-elicitation', confirmedAt: new Date().toISOString(), scope: 'workspace', policyVersion: modelPolicyVersion, target: identity };
  assert.deepEqual(validateModelSelection(selection, catalog, identity), selection);
  assert.throws(() => validateModelSelection(selection, catalog, workspaceIdentity(linked)), /identity changed/);
  assert.throws(() => validateModelSelection({ ...selection, policyVersion: 0 }, catalog, identity), /outdated/);
  assert.throws(() => validateModelSelection(selection, { models: [] }, identity), /selectable/);
});

test('preflight records upward dependency resolution without executing module code or baseline tests', t => {
  const f = fixture(t), module = join(f.root, 'node_modules', 'fixture-module'); mkdirSync(module, { recursive: true });
  writeFileSync(join(module, 'index.js'), "throw new Error('must not execute');");
  const result = inspectExecution({ verification: { command: process.execPath }, preflight: { requiredFiles: ['proof.txt'], nodeModules: ['fixture-module'] } }, f.repo);
  assert.equal(result.executable, realpathSync(process.execPath));
  assert.equal(result.nodeModules[0].resolvedPath, join(module, 'index.js'));
  assert.equal(result.files[0].resolvedPath, join(f.repo, 'proof.txt'));
});

test('missing executable, file or module fails before member inference and preserves structured evidence', async t => {
  const f = fixture(t);
  let calls = 0;
  const store = new TaskStore(join(f.repo, '.codex-teams/state.sqlite'));
  const runtime = new TaskRuntime(store, { run: async () => { calls++; throw new Error('must not call'); } }, { workspace: f.repo, profiles, maxConcurrency: 2, taskTimeoutMs: 10000 });
  t.after(() => runtime.close());
  for (const [command, preflight, code] of [
    ['missing-test-executable-unique', undefined, 'verification_executable_missing'],
    [process.execPath, { requiredFiles: ['missing.txt'] }, 'required_file_missing'],
    [process.execPath, { nodeModules: ['missing-module-unique'] }, 'node_module_unresolved'],
  ]) {
    const task = runtime.create({ ...contract, executionPlan: { verification: { command }, preflight } });
    runtime.start(task.id);
    const result = await runtime.wait(task.id, 10000);
    assert.equal(result.status, 'failed', result.error);
    assert.equal(result.failure.code, code);
    assert.equal(result.attempts[0].failure.phase, 'preflight');
    assert.equal(result.attempts[0].cleanupConfirmed, true);
    assert.equal(result.attempts[0].memberLaunch, undefined);
    assert.equal(calls, 0);
    const view = overview(readSnapshot(f.repo));
    assert.equal(view.target.root, f.repo);
    assert.match(renderText(view), /目标工作区/);
    assert.match(renderHtml(view), /目标工作区/);
    runtime.removeWorkspace(result.attempts[0].workspaceId);
  }
});

test('task binding prevents starting in another checkout and legacy unbound tasks fail before inference', async t => {
  const f = fixture(t), linked = join(f.root, 'linked'); f.git(['worktree', 'add', '--detach', linked]);
  const store = new TaskStore(join(f.repo, '.codex-teams/state.sqlite'));
  const runtime = new TaskRuntime(store, { run: async () => { throw new Error('must not run'); } }, { workspace: f.repo, profiles, maxConcurrency: 2 });
  t.after(() => runtime.close());
  const task = runtime.create(contract);
  runtime.config.workspace = linked;
  assert.throws(() => runtime.start(task.id), /identity changed/);
  assert.equal(store.get(task.id).attempts.length, 0);
  runtime.config.workspace = f.repo;
  delete task.target; store.save(task, 'legacy-fixture');
  assert.throws(() => runtime.start(task.id), /Legacy task/);
});
