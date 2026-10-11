import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskStore } from '../src/store.js';
import { TaskRuntime } from '../src/runtime.js';

export const contract = { objective: 'Find the actual test entry point', acceptance: ['Provide the file and command'], context: ['Do not modify files'] };
export const config = {
  workspace: process.cwd(), maxConcurrency: 2, taskTimeoutMs: 1000,
  profiles: { expert: { model: 'strong-test-model', effort: 'high' } },
};
export const report = {
  summary: 'Found test entry point', criteria: [{ criterion: contract.acceptance[0], satisfied: true, evidence: 'package.json:14 — node --test' }], findings: [], blockers: [],
};
export function setup(t, backend = { run: async () => ({ result: structuredClone(report), usage: null }) }, overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'teams-test-'));
  const path = join(dir, 'state.sqlite');
  const store = new TaskStore(path);
  const runtime = new TaskRuntime(store, backend, { ...config, ...overrides });
  t.after(async () => { await runtime.close(); rmSync(dir, { recursive: true, force: true }); });
  return { runtime, store, dir, path };
}
export function approve(runtime, id) {
  const task = runtime.status(id);
  return runtime.review({ taskId: id, attemptId: task.attempts.at(-1).id, verdict: 'pass', evidence: task.acceptance.map(criterion => ({ criterion, evidence: 'Captain checked package.json against original source.' })) });
}
