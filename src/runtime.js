import { randomUUID } from 'node:crypto';
import { taskSchema, reviewSchema, validateResult } from './contracts.js';
import { selectProfile, taskPrompt } from './policy.js';

export class TaskRuntime {
  constructor(store, backend, config) {
    this.store = store;
    this.backend = backend;
    this.config = config;
    this.active = new Map();
    this.closing = false;
  }
  create(input) {
    if (this.closing) throw new Error('Runtime is closing');
    const contract = taskSchema.parse(input);
    if (new Set(contract.dependencies).size !== contract.dependencies.length) throw new Error('Duplicate dependencies');
    // Dependencies can only reference existing immutable contracts: cycles cannot be introduced.
    for (const id of contract.dependencies) this.store.get(id);
    selectProfile(contract, this.config);
    if (new Set(contract.acceptance).size !== contract.acceptance.length) throw new Error('Duplicate acceptance criteria');
    const task = { ...contract, id: randomUUID(), status: 'pending', attempts: [], createdAt: new Date().toISOString() };
    return this.store.save(task, 'created');
  }
  status(id) { return id ? this.store.get(id) : this.store.list(); }
  start(id, { retry = false, reason = '' } = {}) {
    if (this.closing) throw new Error('Runtime is closing');
    if (this.active.size >= this.config.maxConcurrency) throw new Error('Concurrency limit reached; collect current work first.');
    const task = this.store.get(id);
    const canRetry = ['failed', 'blocked', 'interrupted', 'cancelled'].includes(task.status);
    if (task.status !== 'pending' && !(canRetry && retry && reason.trim())) throw new Error('Task is not pending, or explicit retry reason is missing.');
    if (this.active.has(id)) throw new Error('Previous attempt is still stopping');
    if (retry && task.attempts.length >= 3) throw new Error('Three attempts exhausted; replan with new evidence.');
    const dependencies = task.dependencies.map(dep => this.store.get(dep));
    if (dependencies.some(dep => dep.status !== 'succeeded')) throw new Error('Dependencies must pass review before execution.');
    // A rejected/failed cheaper run never silently repeats on a cheaper route.
    const selection = selectProfile(retry ? { ...task, profile: 'expert' } : task, this.config);
    const attempt = { id: randomUUID(), status: 'running', startedAt: new Date().toISOString(), selection, reason };
    task.attempts.push(attempt);
    task.status = 'running';
    delete task.result; delete task.review; delete task.error;
    this.store.save(task, 'started');
    const controller = new AbortController();
    const entry = { controller, attemptId: attempt.id, done: null };
    this.active.set(id, entry);
    entry.done = this.execute(task, attempt, dependencies, controller).finally(() => this.active.delete(id));
    return { taskId: id, attemptId: attempt.id, status: 'running', selection };
  }
  async execute(task, attempt, dependencies, controller) {
    const timer = setTimeout(() => controller.abort(new Error('Task deadline exceeded')), this.config.taskTimeoutMs);
    const onProgress = update => {
      const current = this.store.get(task.id);
      if (current.status !== 'running' || current.attempts.at(-1)?.id !== attempt.id) return;
      Object.assign(current.attempts.at(-1), update);
      this.store.save(current, 'execution-metadata');
    };
    try {
      const execution = await this.backend.run({
        cwd: this.config.workspace, selection: attempt.selection, acceptance: task.acceptance,
        prompt: taskPrompt(task, dependencies, { reason: attempt.reason, previous: task.attempts.at(-2) }), signal: controller.signal, onProgress,
      });
      if (controller.signal.aborted) throw controller.signal.reason;
      let result;
      try { result = validateResult(execution.result, task); }
      catch (error) {
        const raw = JSON.stringify(execution.result) ?? 'undefined';
        onProgress({ validationFailure: { message: error.message, resultExcerpt: raw.slice(0, 12000), truncated: raw.length > 12000 } });
        throw error;
      }
      this.finish(task.id, attempt.id, result.blockers.length || result.criteria.some(c => !c.satisfied) ? 'blocked' : 'awaiting_review', {
        result, execution: { ...execution, result: undefined },
      });
    } catch (error) {
      this.finish(task.id, attempt.id, controller.signal.aborted ? 'cancelled' : 'failed', { error: error.message });
    } finally { clearTimeout(timer); }
  }
  finish(id, attemptId, status, payload) {
    const task = this.store.get(id);
    if (task.status !== 'running' || task.attempts.at(-1)?.id !== attemptId) return false;
    task.status = status;
    Object.assign(task, payload);
    Object.assign(task.attempts.at(-1), payload, { status, endedAt: new Date().toISOString() });
    this.store.save(task, status);
    return true;
  }
  review(input) {
    const check = reviewSchema.parse(input);
    const task = this.store.get(check.taskId);
    if (task.status !== 'awaiting_review' || task.attempts.at(-1)?.id !== check.attemptId) throw new Error('Stale review or task is not awaiting review');
    if (check.evidence.length !== task.acceptance.length || check.evidence.some((e, i) => e.criterion !== task.acceptance[i])) {
      throw new Error('Review must address all criteria in the original order');
    }
    task.review = { ...check, at: new Date().toISOString(), authority: 'captain-attested' };
    task.status = check.verdict === 'pass' ? 'succeeded' : 'failed';
    Object.assign(task.attempts.at(-1), { status: task.status, review: task.review });
    return this.store.save(task, 'reviewed');
  }
  async wait(id, timeoutMs = 10000) {
    const entry = this.active.get(id);
    if (entry) {
      let timer;
      try { await Promise.race([entry.done, new Promise(resolve => { timer = setTimeout(resolve, timeoutMs); })]); }
      finally { clearTimeout(timer); }
    }
    return this.store.get(id);
  }
  async cancel(id) {
    const entry = this.active.get(id);
    if (entry) {
      entry.controller.abort(new Error('Cancelled by captain'));
      await entry.done;
      return this.store.get(id);
    }
    const task = this.store.get(id);
    if (['pending', 'awaiting_review', 'blocked'].includes(task.status)) {
      task.status = 'cancelled';
      if (task.attempts.length) task.attempts.at(-1).status = 'cancelled';
      this.store.save(task, 'cancelled');
    }
    return task;
  }
  close() {
    return this.closePromise ??= this.shutdown();
  }
  async shutdown() {
    this.closing = true;
    const entries = [...this.active.values()];
    for (const entry of entries) entry.controller.abort(new Error('Runtime shutting down'));
    await Promise.allSettled(entries.map(e => e.done));
    this.store.close();
  }
}
