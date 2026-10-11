// Opt-in live integration check. Uses model quota; never runs as part of npm test.
import { parseArgs } from 'node:util';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { TaskStore } from '../src/store.js';
import { TaskRuntime } from '../src/runtime.js';
import { CodexBackend } from '../src/app-server.js';

const { values } = parseArgs({ options: { model: { type: 'string' }, binary: { type: 'string', default: 'codex' } } });
if (!values.model) throw new Error('Explicit --model is required. This check consumes model quota.');
const workspace = mkdtempSync(join(tmpdir(), 'teams-live-'));
const proof = 'PROOF-' + randomUUID();
writeFileSync(join(workspace, 'proof.txt'), proof + '\n');
const runtime = new TaskRuntime(new TaskStore(join(workspace, '.codex-teams', 'state.sqlite')), new CodexBackend({ binary: values.binary }), {
  workspace, maxConcurrency: 1, taskTimeoutMs: 60000, profiles: { expert: { model: values.model } },
});
const started = Date.now();
try {
  const task = runtime.create({
    objective: 'Read proof.txt in this workspace and return its exact single-line contents in summary. Do not modify files or inspect unrelated paths.',
    kind: 'lookup', complexity: 'bounded', acceptance: ['The summary contains the exact contents of proof.txt, with file evidence.'],
  });
  runtime.start(task.id);
  const result = await runtime.wait(task.id, 65000);
  if (result.status !== 'awaiting_review') throw new Error(`Live execution ${result.status}: ${result.error ?? JSON.stringify(result.result?.blockers)}`);
  if (!result.result.summary.includes(proof)) throw new Error('Live result does not contain the actual file proof');
  const reviewed = runtime.review({ taskId: task.id, attemptId: result.attempts.at(-1).id, verdict: 'pass', evidence: [{ criterion: task.acceptance[0], evidence: 'Independent smoke script compared summary against the exact randomly generated proof.txt contents.' }] });
  console.log(JSON.stringify({ passed: reviewed.status === 'succeeded', actualModel: result.execution.actualModel, elapsedMs: Date.now() - started, usage: result.execution.usage, scope: 'One temporary read-only task, fresh thread, structured result and exact fixture verification. Not a quality benchmark.' }, null, 2));
} catch (error) {
  console.error(error.message); process.exitCode = 1;
} finally {
  await runtime.close();
  rmSync(workspace, { recursive: true, force: true });
}
