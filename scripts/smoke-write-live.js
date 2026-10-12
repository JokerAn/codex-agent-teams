// Explicit bounded model acceptance check; never included in npm test.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { TaskStore } from '../src/store.js';
import { TaskRuntime } from '../src/runtime.js';
import { CodexBackend } from '../src/app-server.js';

const { values } = parseArgs({ options: { model: { type: 'string' }, binary: { type: 'string', default: 'codex' } } });
if (!values.model) throw new Error('Explicit --model is required; this check consumes quota for one writer and one independent reviewer.');
const root = realpathSync(mkdtempSync(join(tmpdir(), 'teams-write-live-')));
const git = args => execFileSync('git', ['--no-optional-locks', '-C', root, ...args], { stdio: 'pipe', encoding: 'utf8' });
git(['init', '-b', 'main']); git(['config', 'user.name', 'Acceptance fixture']); git(['config', 'user.email', 'fixture@localhost']);
writeFileSync(join(root, 'package.json'), '{"type":"module"}\n');
writeFileSync(join(root, '.gitignore'), '.codex-teams/\n');
writeFileSync(join(root, 'sum.js'), 'export function sum(a, b) { return a - b; }\n');
writeFileSync(join(root, 'sum.test.js'), "import test from 'node:test';import assert from 'node:assert/strict';import {sum} from './sum.js';test('positive',()=>assert.equal(sum(7,5),12));test('negative',()=>assert.equal(sum(-4,2),-2));test('zero',()=>assert.equal(sum(0,0),0));\n");
writeFileSync(join(root, 'user.txt'), 'original user file\n'); git(['add', '.']); git(['commit', '-m', 'acceptance fixture']);
// Exercise integration into a dirty source while preserving its original index.
writeFileSync(join(root, 'user.txt'), 'staged user change\n'); git(['add', 'user.txt']); writeFileSync(join(root, 'user.txt'), 'staged plus unstaged user change\n');
const originalHead = git(['rev-parse', 'HEAD']), originalIndex = readFileSync(join(root, '.git/index'));
const runtime = new TaskRuntime(new TaskStore(join(root, '.codex-teams/state.sqlite')), new CodexBackend({ binary: values.binary }), {
  workspace: root, maxConcurrency: 1, taskTimeoutMs: 120000, profiles: { expert: { model: values.model, effort: 'high' } },
});
const started = Date.now(), evidence = resolve('.codex-teams', `live-write-${randomUUID()}`);
mkdirSync(evidence, { recursive: true });
let taskId, result;
try {
  const task = runtime.create({ objective: 'Fix sum.js so sum(a,b) adds the two numbers. Change only sum.js, preserve the public function signature. Read sum.test.js for context. Do not run tests, stage, commit, install, or access network.',
    kind: 'implementation', mode: 'workspace-write', acceptance: ['sum(a,b) returns a+b for positive, negative and zero inputs, preserving the named export.'],
    executionPlan: { dirtyPolicy: 'snapshot', allowedPaths: ['sum.js'], verification: { command: process.execPath, args: ['--test', 'sum.test.js'], timeoutMs: 10000 } } });
  taskId = task.id; runtime.start(task.id);
  result = await runtime.wait(task.id, 125000);
  assert.equal(result.status, 'awaiting_review', JSON.stringify({ error: result.error, blockers: result.result?.blockers, attempt: result.attempts.at(-1) }));
  const attempt = result.attempts.at(-1), workspace = runtime.workspaceStatus(attempt.workspaceId);
  assert.match(readFileSync(join(workspace.worktreePath, 'sum.js'), 'utf8'), /return\s+a\s*\+\s*b/);
  assert.match(readFileSync(join(root, 'sum.js'), 'utf8'), /a - b/);
  assert.equal(attempt.machineReview.status, 'passed'); assert.equal(attempt.machineReview.actualModel, values.model);
  const approved = runtime.review({ taskId: task.id, attemptId: attempt.id, verdict: 'pass', evidence: [{ criterion: task.acceptance[0], evidence: 'Independent acceptance script checked named export and a+b source, 3 passing assertions, unchanged source before integration, and the fresh expert review.' }] });
  assert.equal(approved.status, 'awaiting_integration');
  runtime.integrate(task.id, attempt.id); result = await runtime.wait(task.id, 125000);
  assert.equal(result.status, 'succeeded', result.error);
  assert.match(readFileSync(join(root, 'sum.js'), 'utf8'), /return\s+a\s*\+\s*b/);
  assert.equal(git(['rev-parse', 'HEAD']), originalHead); assert.deepEqual(readFileSync(join(root, '.git/index')), originalIndex);
  assert.equal(readFileSync(join(root, 'user.txt'), 'utf8'), 'staged plus unstaged user change\n');
  const finalWorkspace = runtime.workspaceStatus(attempt.workspaceId);
  assert.equal(finalWorkspace.verifications.length, 2);
  for (const [index, check] of finalWorkspace.verifications.entries()) {
    assert.equal(check.status, 'passed'); assert.equal(check.cleanupConfirmed, true);
    cpSync(check.stdoutPath, join(evidence, `${index}-stdout.log`)); cpSync(check.stderrPath, join(evidence, `${index}-stderr.log`));
  }
  cpSync(attempt.candidate.patchPath, join(evidence, 'change.patch'));
  writeFileSync(join(evidence, 'task.json'), JSON.stringify(result, null, 2));
  writeFileSync(join(evidence, 'workspace.json'), JSON.stringify(finalWorkspace, null, 2));
  runtime.removeWorkspace(attempt.workspaceId, { discard: true });
  const summary = { passed: true, model: values.model, elapsedMs: Date.now() - started,
    memberUsage: result.execution.usage, reviewUsage: attempt.machineReview.usage,
    sourceIndexPreserved: true, existingUserChangesPreserved: true, integratedWithoutCommit: true,
    beforeAndAfterTestsPassed: true, managedWorktreeRemoved: true, evidence,
    scope: 'One bounded real writer + independent expert reviewer, runtime tests, captain attestation, explicit integration and source tests. Not a benchmark.' };
  writeFileSync(join(evidence, 'acceptance.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  if (taskId) {
    await runtime.cancel(taskId).catch(() => {});
    result = runtime.status(taskId);
    writeFileSync(join(evidence, 'failed-task.json'), JSON.stringify(result, null, 2));
  }
  console.error(error.message + `\nEvidence: ${evidence}`); process.exitCode = 1;
} finally {
  await runtime.close();
  // Never delete artifacts if process exit was not confirmed.
  const unsafe = runtime.store.closed && result?.attempts?.at(-1)?.integration?.status === 'recovery_required';
  if (!unsafe && process.exitCode !== 1) rmSync(root, { recursive: true, force: true });
  else console.error(`Temporary fixture retained for inspection: ${root}`);
}
