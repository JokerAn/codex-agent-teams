import { markPhase } from './status.js';
import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { processAlive } from './store.js';
import { runVerification, verificationSchema, verifyLogEvidence } from './verification.js';
import { taskSchema, reviewSchema, validateResult, modelRolesSchema } from './contracts.js';
import { selectProfile, taskPrompt } from './policy.js';
import { GitWorkspace, prepareWorkspaceSchema, inspectWorkspaceSchema, removeWorkspaceSchema, workspaceIdentity, assertWorkspace } from './workspace.js';
import { inspectExecution, executionFailure } from './preflight.js';
import { modelPolicyVersion, validateModelSelection, validateDispatchModels, validateDispatchModel } from './models.js';

export class TaskRuntime {
  constructor(store, backend, config, { requireModelConfirmation = false } = {}) {
    this.store = store;
    this.backend = backend;
    this.config = config;
    this.active = new Map();
    this.closing = false;
    this.requireModelConfirmation = requireModelConfirmation;
    this.modelConfirmation = null;
  }
  confirmModels(profiles, source, { remember = false } = {}) {
    if (this.closing || this.active.size || this.verification) throw new Error('Wait for active execution to exit before changing model selection.');
    if (!['mcp-elicitation', 'interactive-terminal'].includes(source)) throw new Error('Model selection requires direct user confirmation.');
    const selected = modelRolesSchema.parse(profiles);
    const confirmation = { profiles: selected, source, confirmedAt: new Date().toISOString(), scope: remember ? 'workspace' : 'runtime-session',
      policyVersion: modelPolicyVersion, target: workspaceIdentity(this.config.workspace) };
    this.store.saveModelPreference(remember ? confirmation : null);
    this.config = { ...this.config, profiles: selected };
    this.modelConfirmation = confirmation;
    return structuredClone(this.modelConfirmation);
  }
  restoreModels(selection, catalog) {
    if (this.closing || this.active.size || this.verification) throw new Error('Wait for active execution to exit before restoring models.');
    this.modelConfirmation = validateModelSelection(selection, catalog, workspaceIdentity(this.config.workspace));
    this.config = { ...this.config, profiles: this.modelConfirmation.profiles };
    return structuredClone(this.modelConfirmation);
  }
  forgetModels() {
    if (this.closing || this.active.size || this.verification) throw new Error('Wait for active execution to exit before forgetting models.');
    this.store.saveModelPreference(null);
    this.modelConfirmation = null;
  }
  create(input) {
    if (this.closing) throw new Error('Runtime is closing');
    const contract = taskSchema.parse(input);
    const target = workspaceIdentity(this.config.workspace);
    if (contract.expectedWorkspace) assertWorkspace(contract.expectedWorkspace, target);
    if (new Set(contract.dependencies).size !== contract.dependencies.length) throw new Error('Duplicate dependencies');
    // Dependencies can only reference existing immutable contracts: cycles cannot be introduced.
    for (const id of contract.dependencies) this.store.get(id);
    // Public dispatch may supply different attempt-local roles at start; old preferences must not
    // reject a valid immutable contract before that explicit choice is known.
    if (!contract.model && !this.requireModelConfirmation) selectProfile(contract, this.config);
    if (new Set(contract.acceptance).size !== contract.acceptance.length) throw new Error('Duplicate acceptance criteria');
    const task = { ...contract, target, id: randomUUID(), status: 'pending', attempts: [], createdAt: new Date().toISOString() };
    return this.store.save(task, 'created');
  }
  status(id) { return id ? this.store.get(id) : this.store.list(); }
  start(id, { retry = false, reason = '', models, catalog } = {}) {
    if (this.closing) throw new Error('Runtime is closing');
    if (this.requireModelConfirmation && !this.modelConfirmation && !models) throw new Error('User model confirmation or explicit captain models required. Pass models to teams_start, or optionally call teams_models with confirm=true.');
    if (models && !catalog) throw new Error('Explicit captain models require a live catalog before starting members.');
    const profiles = models ? validateDispatchModels(models, catalog) : this.config.profiles;
    // `this.verification` is a single slot, and what it actually serializes is narrow: a manually
    // requested check (verifyWorkspace, CLI `workspace verify`) against a new member, and two manual
    // checks on two different worktrees. It does NOT limit concurrency of ordinary read-only tasks: a
    // read-only contract normally carries no executionPlan, so `workspace` stays undefined in execute()
    // and the verification block is never entered. A read-only task that does carry an executionPlan is
    // `workspaceBound`, so the exclusive rule below already refuses to overlap it with anything. Both
    // in-attempt (execute) and integration callers pass a binding, and verifyWorkspaceRecord refuses a
    // bound check unless it is the sole active attempt, so lifting the slot to a per-workspace map would
    // not make any documented concurrent read-only work newly possible. The limit is deliberate and
    // recorded in docs/WORKSPACES.md ("带计划的任务本轮独占执行阶段，不建验证队列").
    if (this.verification) throw new Error('Wait for command verification to exit before starting members');
    for (const task of this.store.list()) { const attempt = task.attempts.at(-1); if (attempt?.cleanupConfirmed === false) throw new Error('Previous member/reviewer exit is unconfirmed; reopen after checking its process group'); }
    for (const workspace of this.store.listWorkspaces()) this.assertVerificationExited(workspace);
    if (this.active.size >= this.config.maxConcurrency) throw new Error('Concurrency limit reached; collect current work first.');
    const task = this.store.get(id);
    const target = workspaceIdentity(this.config.workspace);
    if (task.target) assertWorkspace(task.target, target);
    else throw new Error('Legacy task has no bound target workspace; create a new task.');
    if (this.modelConfirmation) assertWorkspace(this.modelConfirmation.target, target);
    if ((task.executionPlan && this.active.size) || [...this.active.values()].some(entry => entry.workspaceBound)) throw new Error('Verified-worktree tasks run exclusively until member and command exit');
    const canRetry = ['failed', 'blocked', 'interrupted', 'cancelled', 'timed_out'].includes(task.status);
    if (task.status !== 'pending' && !(canRetry && retry && reason.trim())) throw new Error('Task is not pending, or explicit retry reason is missing.');
    if (this.active.has(id)) throw new Error('Previous attempt is still stopping');
    if (retry && (processAlive(task.attempts.at(-1)?.childPid, true) || processAlive(task.attempts.at(-1)?.machineReview?.childPid, true))) throw new Error('Previous member process group exit is unconfirmed');
    if (retry && task.attempts.length >= 3) throw new Error('Three attempts exhausted; replan with new evidence.');
    const dependencies = task.dependencies.map(dep => this.store.get(dep));
    if (dependencies.some(dep => dep.status !== 'succeeded')) throw new Error('Dependencies must pass review before execution.');
    // A rejected/failed cheaper run never silently repeats on a cheaper route.
    const selection = selectProfile(retry ? { ...task, profile: 'expert', model: undefined, effort: undefined } : task, { ...this.config, profiles });
    if (catalog) {
      validateDispatchModel(selection, catalog);
      validateDispatchModel(profiles.expert, catalog);
    }
    const attempt = { id: randomUUID(), status: 'running', startedAt: new Date().toISOString(), selection, reason,
      reviewerSelection: { ...profiles.expert }, ...(models ? { dispatch: { source: 'captain-explicit', profiles: structuredClone(profiles), target, validatedAt: new Date().toISOString() } } : this.modelConfirmation ? { modelConfirmation: structuredClone(this.modelConfirmation) } : {}) };
    markPhase(attempt, task.executionPlan ? 'preparing' : 'member', attempt.startedAt);
    task.attempts.push(attempt);
    task.status = 'running';
    delete task.result; delete task.review; delete task.error; delete task.execution; delete task.failure;
    this.store.save(task, 'started');
    const controller = new AbortController();
    const entry = { controller, attemptId: attempt.id, workspaceBound: Boolean(task.executionPlan), done: null };
    this.active.set(id, entry);
    entry.done = this.execute(task, attempt, dependencies, controller).finally(() => this.active.delete(id));
    return { taskId: id, attemptId: attempt.id, status: 'running', title: task.title ?? task.objective.slice(0, 80),
      kind: task.kind, selection, reviewerSelection: task.mode === 'workspace-write' ? attempt.reviewerSelection : null,
      confirmationScope: attempt.modelConfirmation?.scope ?? null, dispatchSource: attempt.dispatch?.source ?? null, target };
  }
  async execute(task, attempt, dependencies, controller) {
    const deadline = Date.now() + this.config.taskTimeoutMs;
    // Only the runtime sets this. Captain cancellation arrives through the same AbortController, so the
    // reason string alone is not a reliable discriminator; the flag is owned by whoever aborted.
    let timedOut = false;
    const exceedDeadline = () => {
      if (timedOut) return;
      // A captain cancellation that lands first owns the outcome: whoever aborts the controller decides
      // why. Without this, a cancel issued just before the deadline was recorded as `timed_out` (with a
      // `task_deadline_exceeded` code) while `error` still said "Cancelled by captain" — two records of
      // one event that disagree, and a nextAction telling the user to widen a timeout they never hit.
      if (controller.signal.aborted) return;
      timedOut = true;
      controller.abort(new Error('Task deadline exceeded'));
    };
    const timer = setTimeout(exceedDeadline, this.config.taskTimeoutMs);
    // Late updates after the attempt reached a terminal state must not overwrite it, but dropping them
    // silently hid the fact that a member's exit receipt never landed (leaving `memberLaunch: active`
    // behind). Record the drop instead of returning quietly.
    const writable = () => {
      const current = this.store.get(task.id);
      return current.status === 'running' && current.attempts.at(-1)?.id === attempt.id ? current : null;
    };
    const progress = update => {
      const current = writable();
      if (!current) return this.store.save(this.store.get(task.id), 'progress-dropped');
      Object.assign(current.attempts.at(-1), update);
      this.store.save(current, 'execution-metadata');
    };
    const phase = name => {
      const current = writable();
      if (!current) return this.store.save(this.store.get(task.id), 'phase-dropped');
      markPhase(current.attempts.at(-1), name);
      this.store.save(current, 'phase-changed');
    };
    const live = () => {
      if (Date.now() >= deadline) exceedDeadline();
      if (controller.signal.aborted) throw controller.signal.reason;
    };
    let execution, result, workspace;
    try {
      // Worktree preparation is synchronous (git fork/exec plus whole-tree hashing). Yield once so
      // the MCP transport can answer status calls while a member is being prepared.
      await new Promise(resolve => setImmediate(resolve));
      if (task.executionPlan) {
        workspace = this.prepareWorkspaceRecord({ dirtyPolicy: task.executionPlan.dirtyPolicy }, { taskId: task.id, attemptId: attempt.id });
        progress({ workspaceInputDigest: new GitWorkspace(this.config.workspace).inspect(workspace).contentDigest });
        phase('preflight');
        progress({ preflight: inspectExecution(task.executionPlan, workspace.worktreePath) });
      }
      live();
      phase('member');
      execution = await this.backend.run({ cwd: workspace?.worktreePath ?? this.config.workspace, mode: task.mode,
        selection: attempt.selection, acceptance: task.acceptance,
        prompt: taskPrompt(task, dependencies, { reason: attempt.reason, previous: task.attempts.at(-2) }), signal: controller.signal, onProgress: progress });
      live();
      try { result = validateResult(execution.result, task); }
      catch (error) {
        const raw = JSON.stringify(execution.result) ?? 'undefined';
        progress({ validationFailure: { message: error.message, resultExcerpt: raw.slice(0, 12000), truncated: raw.length > 12000 } });
        throw error;
      }
      if (workspace && !result.blockers.length && result.criteria.every(criterion => criterion.satisfied)) {
        phase('auditing');
        const manager = new GitWorkspace(this.config.workspace), before = manager.inspect(workspace);
        if (processAlive(this.store.get(task.id).attempts.at(-1)?.childPid, true)) throw new Error('Member process group exit is unconfirmed; verification refused');
        if (task.mode === 'workspace-write') {
          progress({ candidate: manager.candidate(workspace, task.executionPlan.allowedPaths) });
        } else if (before.contentDigest !== this.store.get(task.id).attempts.at(-1).workspaceInputDigest || !before.clean) throw new Error('Read-only member workspace changed; prepare a fresh attempt');
        live();
        phase('verification');
        const check = await this.verifyWorkspaceRecord(workspace.id, task.executionPlan.verification, { taskId: task.id, attemptId: attempt.id, controller });
        live();
        if (check.status !== 'passed' || !check.cleanupConfirmed || check.workspaceChanged) throw new Error(`Attempt verification did not pass unchanged: ${check.status}${check.error ? ': ' + check.error : ''}`);
        if (task.mode === 'workspace-write') {
          const candidate = this.store.get(task.id).attempts.at(-1).candidate;
          const patch = manager.candidateEvidence(workspace, candidate).toString('utf8');
          const packet = JSON.stringify({ objective: task.objective, acceptance: task.acceptance, constraints: task.context,
            allowedPaths: task.executionPlan.allowedPaths, baselineCommit: workspace.baseline.commit, patch,
            memberReport: result, verification: { command: check.command, args: check.args, exitCode: check.exitCode, stdoutPath: check.stdoutPath, stderrPath: check.stderrPath },
            instruction: 'Inspect actual files and patch against every criterion. Do not run commands that modify files. Report concrete defects or missing evidence honestly.' });
          if (packet.length > 120000) throw new Error('Review packet exceeds 120000 characters; narrow the change');
          phase('independent_review');
          progress({ machineReview: { status: 'running', selection: attempt.reviewerSelection } });
          const reviewed = await this.backend.run({ cwd: workspace.worktreePath, mode: 'read-only', role: 'review',
            selection: attempt.reviewerSelection, acceptance: task.acceptance, prompt: packet, signal: controller.signal,
            onProgress: update => { const previous = this.store.get(task.id).attempts.at(-1).machineReview; progress({ machineReview: { ...previous, ...update } }); } });
          live();
          if (reviewed.actualModel !== attempt.reviewerSelection.model) throw new Error('Independent review model changed unexpectedly');
          if (reviewed.threadId && reviewed.threadId === execution.threadId) throw new Error('Independent review must use a fresh thread');
          const reviewResult = validateResult(reviewed.result, task);
          const passed = !reviewResult.blockers.length && reviewResult.criteria.every(criterion => criterion.satisfied);
          progress({ machineReview: { ...this.store.get(task.id).attempts.at(-1).machineReview, ...reviewed, result: reviewResult,
            candidateDigest: candidate.digest, status: passed ? 'passed' : 'rejected' } });
          if (processAlive(this.store.get(task.id).attempts.at(-1).machineReview.childPid, true)) throw new Error('Reviewer process group exit is unconfirmed');
          manager.candidateEvidence(workspace, candidate);
          if (!passed) throw new Error('Independent expert review rejected the change');
        }
      }
      this.finish(task.id, attempt.id, result.blockers.length || result.criteria.some(criterion => !criterion.satisfied) ? 'blocked' : 'awaiting_review', {
        result, execution: { ...execution, result: undefined } });
    } catch (error) {
      // A deadline overrun is not a captain cancellation: reporting it as "cancelled" told users to go
      // look for a leftover process that never existed. A captain cancellation is also not a failure —
      // it carries no phase-level `failure`, because "which stage failed" is meaningless when the captain
      // stopped the run, and the phase bucket would otherwise claim "检查成员的原始错误" for a task whose
      // member was simply told to stop. `task.error` still records why.
      const status = timedOut ? 'timed_out' : controller.signal.aborted ? 'cancelled' : 'failed';
      this.finish(task.id, attempt.id, status, { error: error.message,
        // No residual-process claim here: whether a member group is still alive is decided by finish()
        // and read back from the attempt record. Asserting it in this string produced "未检测到需确认的
        // 残留进程" next to `cleanupConfirmed:false` and a live process group — a status line contradicting
        // both the record and the retry guard that was blocking the user.
        ...(status === 'cancelled' ? {} : {
          failure: timedOut ? { code: 'task_deadline_exceeded', phase: this.store.get(task.id).attempts.at(-1).phase,
            nextAction: `本轮超出 ${Math.round(this.config.taskTimeoutMs / 1000)} 秒上限；缩小任务范围或提高 taskTimeoutMs 后显式重试，重试前确认成员进程已退出。` }
            : executionFailure(error, this.store.get(task.id).attempts.at(-1).phase),
        }),
        ...(result ? { result, execution: { ...execution, result: undefined } } : {}) });
    } finally { clearTimeout(timer); }
  }
  finish(id, attemptId, status, payload) {
    const task = this.store.get(id);
    // Returning false used to be ignored by both callers, which could leave the attempt stuck at
    // "running" with no endedAt (and a memberLaunch that never became "exited"). Record the drop.
    if (task.status !== 'running' || task.attempts.at(-1)?.id !== attemptId) { this.store.save(task, 'finish-dropped'); return false; }
    const cleanupConfirmed = !processAlive(task.attempts.at(-1)?.childPid, true) && !processAlive(task.attempts.at(-1)?.machineReview?.childPid, true);
    if (!cleanupConfirmed && status === 'awaiting_review') { status = 'failed'; payload = { ...payload, error: 'Member/reviewer process group exit is unconfirmed' }; }
    task.status = status;
    Object.assign(task, payload);
    const attempt = task.attempts.at(-1);
    Object.assign(attempt, payload, { status, endedAt: new Date().toISOString(), cleanupConfirmed });
    markPhase(attempt, status, attempt.endedAt);
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
    const verificationId = check.verdict === 'pass' && task.executionPlan ? this.checkAttemptEvidence(task).verification.id : undefined;
    task.review = { ...check, at: new Date().toISOString(), authority: 'captain-attested', ...(verificationId ? { verificationId } : {}) };
    task.status = check.verdict === 'pass' ? task.mode === 'workspace-write' ? 'awaiting_integration' : 'succeeded' : 'failed';
    Object.assign(task.attempts.at(-1), { status: task.status, review: task.review });
    markPhase(task.attempts.at(-1), task.status, task.review.at);
    return this.store.save(task, 'reviewed');
  }
  checkAttemptEvidence(task) {
    const attempt = task.attempts.at(-1), workspace = this.store.getWorkspace(attempt.workspaceId);
    this.assertAttemptBinding(workspace, task.id, attempt.id);
    this.assertVerificationExited(workspace);
    if (processAlive(attempt.childPid, true) || processAlive(attempt.machineReview?.childPid, true)) throw new Error('Member/reviewer exit is unconfirmed');
    const verification = workspace.verifications?.find(value => value.id === attempt.verificationId);
    const input = task.mode === 'workspace-write' ? attempt.candidate?.digest : attempt.workspaceInputDigest;
    if (verification?.taskId !== task.id || verification.attemptId !== attempt.id || ['command', 'args', 'timeoutMs', 'maxOutputBytes'].some(key => JSON.stringify(verification[key]) !== JSON.stringify(task.executionPlan.verification[key])) || verification.status !== 'passed' || !verification.cleanupConfirmed || verification.workspaceChanged || verification.baselineCommit !== workspace.baseline.commit || workspace.baseline.commit !== attempt.baselineCommit || verification.inputDigest !== input || verification.outputDigest !== input) throw new Error('No current passed verification bound to this attempt');
    const manager = new GitWorkspace(this.config.workspace), current = manager.inspect(workspace);
    if (workspace.status !== 'ready' || current.contentDigest !== verification.outputDigest) throw new Error('Verified workspace changed or was removed; cancel and retry with a fresh attempt');
    verifyLogEvidence(verification, join(manager.managed, 'verifications', verification.id));
    if (task.mode === 'workspace-write') {
      if (attempt.machineReview?.status !== 'passed' || attempt.machineReview.candidateDigest !== attempt.candidate.digest || attempt.machineReview.actualModel !== (attempt.reviewerSelection ?? this.config.profiles.expert).model) throw new Error('Current independent expert review is required');
      manager.candidateEvidence(workspace, attempt.candidate);
    }
    return { workspace, verification, manager };
  }
  integrate(id, attemptId) {
    if (this.closing) throw new Error('Runtime is closing');
    this.assertWorkspaceIdle();
    const task = this.store.get(id), attempt = task.attempts.at(-1);
    if (task.target) assertWorkspace(task.target, workspaceIdentity(this.config.workspace));
    if (task.mode !== 'workspace-write' || task.status !== 'awaiting_integration' || attempt?.id !== attemptId) throw new Error('Integration requires the current captain-approved write attempt');
    const { workspace, manager } = this.checkAttemptEvidence(task);
    if (manager.source().digest !== workspace.baseline.sourceDigest) throw new Error('Source workspace changed since baseline; integration refused');
    const controller = new AbortController();
    attempt.integration = { status: 'applying', startedAt: new Date().toISOString() };
    markPhase(attempt, 'applying', attempt.integration.startedAt);
    task.status = 'integrating'; attempt.status = 'integrating'; this.store.save(task, 'integration-started');
    const entry = { controller, attemptId, workspaceBound: true, done: null };
    this.active.set(id, entry);
    entry.done = (async () => {
      const deadline = Date.now() + this.config.taskTimeoutMs;
      const timer = setTimeout(() => controller.abort(new Error('Integration deadline exceeded')), this.config.taskTimeoutMs);
      try {
        const digest = manager.applyCandidate(workspace, attempt.candidate);
        const current = this.store.get(id); current.attempts.at(-1).integration.appliedDigest = digest;
        markPhase(current.attempts.at(-1), 'integration_verification');
        current.attempts.at(-1).integration.status = 'verifying'; this.store.save(current, 'integration-applied');
        if (Date.now() >= deadline) controller.abort(new Error('Integration deadline exceeded'));
        if (controller.signal.aborted) throw controller.signal.reason;
        const check = await this.verifyWorkspaceRecord(workspace.id, task.executionPlan.verification, { taskId: id, attemptId, controller, phase: 'integration' });
        if (Date.now() >= deadline) controller.abort(new Error('Integration deadline exceeded'));
        if (controller.signal.aborted) throw controller.signal.reason;
        if (check.status !== 'passed' || !check.cleanupConfirmed || check.workspaceChanged) throw new Error('Integration verification failed; applied changes retained for inspection');
        const latest = this.store.get(id), integrated = latest.attempts.at(-1);
        integrated.integration.status = 'passed'; integrated.integration.endedAt = new Date().toISOString();
        integrated.status = 'succeeded'; latest.status = 'succeeded';
        markPhase(integrated, 'succeeded', integrated.integration.endedAt);
        this.store.save(latest, 'integrated-and-verified');
      } catch (error) {
        const latest = this.store.get(id), interrupted = latest.attempts.at(-1);
        latest.status = 'integration_failed'; interrupted.status = 'integration_failed';
        interrupted.integration.status = 'recovery_required'; interrupted.integration.error = error.message;
        interrupted.integration.endedAt = new Date().toISOString();
        markPhase(interrupted, 'integration_failed', interrupted.integration.endedAt);
        latest.error = error.message; this.store.save(latest, 'integration-failed');
      } finally { clearTimeout(timer); }
    })().finally(() => this.active.delete(id));
    return { taskId: id, attemptId, status: 'integrating' };
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
    if (['pending', 'awaiting_review', 'awaiting_integration', 'blocked'].includes(task.status)) {
      task.status = 'cancelled';
      if (task.attempts.length) { task.attempts.at(-1).status = 'cancelled'; markPhase(task.attempts.at(-1), 'cancelled'); }
      this.store.save(task, 'cancelled');
    }
    return task;
  }
  prepareWorkspace(input = {}) {
    if (this.closing) throw new Error('Runtime is closing');
    this.assertWorkspaceIdle();
    return this.prepareWorkspaceRecord(input);
  }
  prepareWorkspaceRecord(input, binding) {
    const { dirtyPolicy } = prepareWorkspaceSchema.parse(input);
    const manager = new GitWorkspace(this.config.workspace);
    const id = randomUUID();
    const record = { id, status: 'preparing', repoRoot: manager.root, worktreePath: manager.path(id), ...(binding ? { binding } : {}), createdAt: new Date().toISOString() };
    const save = event => this.saveWorkspaceRecord(record, event);
    save('workspace-preparing');
    try {
      manager.prepare(record, dirtyPolicy, () => save('workspace-baseline-captured'));
      record.status = 'ready';
      return save('workspace-ready');
    } catch (error) {
      record.status = 'failed'; record.error = error.message;
      save('workspace-failed');
      throw new Error(`Workspace ${id} failed: ${error.message}`);
    }
  }
  workspaceStatus(id) { return id ? this.store.getWorkspace(id) : this.store.listWorkspaces(); }
  inspectWorkspace(id, input = {}) {
    if (this.closing) throw new Error('Runtime is closing');
    this.assertWorkspaceIdle();
    const options = inspectWorkspaceSchema.parse(input);
    const record = this.store.getWorkspace(id);
    this.assertVerificationExited(record);
    if (!['ready', 'failed', 'recovery_required'].includes(record.status)) throw new Error('Workspace is not inspectable');
    record.lastInspection = new GitWorkspace(this.config.workspace).inspect(record, options);
    return this.store.saveWorkspace(record, 'workspace-inspected');
  }
  removeWorkspace(id, input = {}) {
    if (this.closing) throw new Error('Runtime is closing');
    this.assertWorkspaceIdle();
    const options = removeWorkspaceSchema.parse(input);
    const record = this.store.getWorkspace(id);
    this.assertVerificationExited(record);
    if (!['ready', 'failed', 'recovery_required'].includes(record.status)) throw new Error('Workspace is not removable');
    if (record.binding) {
      const task = this.store.get(record.binding.taskId);
      const attempt = task.attempts.find(value => value.id === record.binding.attemptId);
      if (processAlive(attempt?.childPid, true) || processAlive(attempt?.machineReview?.childPid, true) || (task.attempts.at(-1)?.id === record.binding.attemptId && ['running', 'awaiting_review', 'awaiting_integration', 'integrating'].includes(task.status))) throw new Error('Review or cancel the bound attempt and confirm member exit before workspace removal');
    }
    record.statusBeforeRemoval = record.status;
    record.status = 'removing';
    this.store.saveWorkspace(record, 'workspace-removing');
    try {
      record.lastInspection = new GitWorkspace(this.config.workspace).remove(record, options);
      record.status = 'removed'; record.discarded = options.discard;
      delete record.error; delete record.statusBeforeRemoval;
      return this.store.saveWorkspace(record, 'workspace-removed');
    } catch (error) {
      record.status = 'recovery_required'; record.error = error.message;
      this.store.saveWorkspace(record, 'workspace-removal-refused');
      throw error;
    }
  }
  assertWorkspaceIdle() {
    if (this.active.size || this.verification) throw new Error('Workspace operations require managed members and verification commands to exit first');
    for (const task of this.store.list()) { const attempt = task.attempts.at(-1); if (attempt?.cleanupConfirmed === false) throw new Error('Previous member/reviewer exit is unconfirmed; reopen after checking its process group'); }
    for (const workspace of this.store.listWorkspaces()) this.assertVerificationExited(workspace);
  }
  assertVerificationExited(record) {
    for (const check of record.verifications ?? []) {
      if (check.status === 'running' || check.cleanupConfirmed === false) throw new Error('Previous verification exit is unconfirmed; reopen the runtime after checking its process group');
    }
  }
  assertAttemptBinding(record, taskId, attemptId) {
    const task = this.store.get(taskId);
    if (record.binding?.taskId !== taskId || record.binding.attemptId !== attemptId || !['running', 'awaiting_review', 'awaiting_integration', 'integrating'].includes(task.status) || task.attempts.at(-1)?.id !== attemptId || task.attempts.at(-1)?.workspaceId !== record.id) throw new Error('Stale or mismatched workspace attempt binding');
    return task;
  }
  saveWorkspaceRecord(record, event) {
    if (!record.binding) return this.store.saveWorkspace(record, event);
    const { taskId, attemptId } = record.binding;
    const task = this.store.get(taskId), attempt = task.attempts.at(-1);
    if (task.status !== 'running' || attempt?.id !== attemptId || attempt.workspaceId && attempt.workspaceId !== record.id) throw new Error('Stale workspace attempt cannot write back');
    Object.assign(attempt, { workspaceId: record.id, ...(record.baseline ? { baselineCommit: record.baseline.commit } : {}) });
    return this.store.saveBinding(task, record, event);
  }
  async verifyWorkspace(id, input) {
    if (this.closing) throw new Error('Runtime is closing');
    this.assertWorkspaceIdle();
    if (this.store.getWorkspace(id).binding) throw new Error('Bound workspaces are verified only by their task attempt');
    return this.verifyWorkspaceRecord(id, input);
  }
  async verifyWorkspaceRecord(id, input, binding) {
    if (this.closing) throw new Error('Runtime is closing');
    if (binding && (this.active.size !== 1 || this.active.get(binding.taskId)?.attemptId !== binding.attemptId || this.verification)) throw new Error('Bound verification requires its exclusive active attempt');
    const spec = verificationSchema.parse(input);
    const record = this.store.getWorkspace(id);
    this.assertVerificationExited(record);
    if (binding) this.assertAttemptBinding(record, binding.taskId, binding.attemptId);
    if (record.status !== 'ready') throw new Error('Verification requires a ready managed workspace');
    if ((record.verifications?.length ?? 0) >= 20) throw new Error('20 verification records reached; prepare a new workspace');
    const manager = new GitWorkspace(this.config.workspace);
    const snapshot = () => binding?.phase === 'integration' ? { head: manager.head(), contentDigest: manager.source().digest } : manager.inspect(record);
    const before = snapshot();
    const logs = join(manager.managed, 'verifications');
    if (existsSync(logs) && (!lstatSync(logs).isDirectory() || lstatSync(logs).isSymbolicLink())) throw new Error('Verification log root must not be a symlink');
    mkdirSync(logs, { recursive: true, mode: 0o700 });
    const check = { id: randomUUID(), ...spec, status: 'running', startedAt: new Date().toISOString(), baselineCommit: record.baseline.commit,
      worktreePath: record.worktreePath, ...(binding ? { taskId: binding.taskId, attemptId: binding.attemptId, ...(binding.phase ? { phase: binding.phase } : {}) } : {}), inputHead: before.head, inputDigest: before.contentDigest, cleanupConfirmed: false };
    (record.verifications ??= []).push(check);
    const save = event => {
      if (!binding) return this.store.saveWorkspace(record, event);
      const task = this.assertAttemptBinding(record, binding.taskId, binding.attemptId);
      if (binding.phase === 'integration') task.attempts.at(-1).integration.verificationId = check.id;
      else task.attempts.at(-1).verificationId = check.id;
      return this.store.saveBinding(task, record, event);
    };
    save('verification-started');
    const controller = binding?.controller ?? new AbortController();
    const entry = { workspaceId: id, controller, done: null };
    this.verification = entry;
    entry.done = (async () => {
      try {
        const result = await runVerification(spec, { cwd: binding?.phase === 'integration' ? manager.root : record.worktreePath, logDir: join(logs, check.id), signal: controller.signal,
          onLaunch: () => { check.launchAttempted = true; save('verification-launch-attempted'); },
          onSpawn: update => { Object.assign(check, update); save('verification-child-started'); } });
        Object.assign(check, result);
        if (check.cleanupConfirmed) {
          try {
            const after = snapshot();
            check.outputHead = after.head; check.outputDigest = after.contentDigest;
            check.workspaceChanged = before.contentDigest !== after.contentDigest;
            record.lastInspection = after;
          } catch (error) { check.status = 'failed'; check.error = `Post-command audit failed: ${error.message}`; }
        } else { check.status = 'recovery_required'; check.error ??= 'Command process exit was not confirmed'; }
      } catch (error) { check.status = 'failed'; check.error = error.message; check.cleanupConfirmed = !check.childPid || !processAlive(check.childPid, true); check.endedAt = new Date().toISOString(); }
      save('verification-finished');
      return check;
    })().finally(() => { this.verification = undefined; });
    return entry.done;
  }
  async cancelVerification(id) {
    const entry = this.verification;
    if (entry?.workspaceId !== id) throw new Error('No active verification for this workspace');
    entry.controller.abort(new Error('Verification cancelled by operator'));
    return entry.done;
  }
  close() {
    return this.closePromise ??= this.shutdown();
  }
  async shutdown() {
    this.closing = true;
    const entries = [...this.active.values()];
    for (const entry of entries) entry.controller.abort(new Error('Runtime shutting down'));
    const verification = this.verification;
    verification?.controller.abort(new Error('Runtime shutting down'));
    await Promise.allSettled([...entries.map(e => e.done), ...(verification ? [verification.done] : [])]);
    this.store.close();
  }
}
