import packageInfo from '../package.json' with { type: 'json' };
import { DatabaseSync } from 'node:sqlite';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { processAlive } from './store.js';
import { workspaceIdentity } from './workspace.js';

const root = fileURLToPath(new URL('../', import.meta.url));
export const phaseLabels = {
  pending: '等待启动', preflight: '启动前检查', preparing: '准备工作区', member: '成员执行', auditing: '检查改动',
  verification: '命令验证', independent_review: '独立审查', awaiting_review: '等待队长复核',
  awaiting_integration: '等待集成', applying: '应用补丁', integration_verification: '源工作区复验',
  succeeded: '已完成并验收', failed: '执行失败', blocked: '任务受阻', cancelled: '已取消',
  timed_out: '超出任务时限', interrupted: '执行中断', integration_failed: '集成失败，需检查现场', unknown: '阶段未知',
};
export function pluginIdentity() {
  const path = join(root, 'build-info.json');
  const build = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
  return { name: 'codex-agent-teams', version: packageInfo.version, sourceRoot: root,
    distribution: build ? 'packaged' : 'source', build: build ? { version: build.version, createdAt: build.createdAt, sourceDigest: build.sourceDigest } : null };
}
export function markPhase(attempt, phase, at = new Date().toISOString()) {
  if (attempt.phase === phase) return;
  const phases = attempt.phases ??= [];
  if (phases.length) phases.at(-1).endedAt = at;
  phases.push({ phase, startedAt: at });
  attempt.phase = phase;
}

/** Observation never acquires owner, recovers attempts or creates a state database. */
export function readSnapshot(workspace, taskId) {
  const target = workspaceIdentity(workspace);
  const path = join(workspace, '.codex-teams', 'state.sqlite');
  if (!existsSync(path)) {
    if (taskId) throw new Error(`Unknown task: ${taskId}`);
    return { tasks: [], workspaces: [], owner: null, stateExists: false, target, modelPreference: null };
  }
  if (lstatSync(join(workspace, '.codex-teams')).isSymbolicLink() || lstatSync(path).isSymbolicLink()) throw new Error('State directory and database must not be symlinks');
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    db.exec('PRAGMA busy_timeout=3000; BEGIN');
    const version = db.prepare('SELECT value FROM meta WHERE key=?').get('version');
    if (version?.value !== '1') throw new Error('Unsupported state schema version');
    const ownerRow = db.prepare('SELECT value FROM meta WHERE key=?').get('owner');
    const tasks = taskId ? db.prepare('SELECT data FROM tasks WHERE id=?').all(taskId) : db.prepare('SELECT data FROM tasks ORDER BY rowid').all();
    if (taskId && !tasks.length) throw new Error(`Unknown task: ${taskId}`);
    const workspaces = db.prepare('SELECT data FROM workspaces ORDER BY rowid').all();
    // Never expose the owner token or arbitrary metadata.
    const owner = ownerRow ? JSON.parse(ownerRow.value) : null;
    const saved = db.prepare('SELECT value FROM meta WHERE key=?').get('modelPreference');
    return { target, modelPreference: saved ? JSON.parse(saved.value) : null, tasks: tasks.map(row => JSON.parse(row.data)), workspaces: workspaces.map(row => JSON.parse(row.data)),
      owner: owner ? { pid: owner.pid, processAlive: processAlive(owner.pid), version: owner.version ?? null, sourceRoot: owner.sourceRoot ?? null } : null, stateExists: true };
  } finally { db.close(); }
}
const elapsed = (start, end) => Number.isFinite(Date.parse(start)) && Number.isFinite(Date.parse(end)) ? Math.max(0, Date.parse(end) - Date.parse(start)) : null;
/** No new record for this long while a task is active is worth surfacing; it is a hint, not a failure. */
const STALE_AFTER_MS = 180000;
const usage = value => value?.total ? Object.fromEntries(['totalTokens', 'inputTokens', 'cachedInputTokens', 'outputTokens'].map(key => [key, value.total[key] ?? null])) : null;
const nextActions = { pending: '明确任务合同后启动', running: '成员继续当前阶段；主 Agent 继续自己的独立交付，完成后收取结果', integrating: '运行时继续源工作区复验；主 Agent 按需查看记录',
  awaiting_review: '逐项核对证据，再执行队长复核', awaiting_integration: '检查源工作区与补丁，再显式集成',
  succeeded: '查看结果与验证证据', failed: '检查错误与退出记录，再明确重试理由', blocked: '补充缺失上下文或重新规划',
  cancelled: '确认退出后按需重新规划', timed_out: '本轮超出时限；缩小范围或提高 taskTimeoutMs 后显式重试',
  interrupted: '检查旧进程与证据，再显式重试', integration_failed: '检查已应用的源改动和日志，禁止盲目重放' };
const actionOwner = (status, phase) => status === 'running'
  ? phase === 'member' ? '执行成员' : phase === 'independent_review' ? '独立审查成员' : phase === 'unknown' ? '主 Agent（核实进度）' : '运行时'
  : status === 'integrating' ? '运行时' : status === 'succeeded' ? '无需操作' : '主 Agent';
export const modelLabel = selection => `${selection?.model ?? '模型未知'} / ${selection?.effort ?? '推理强度未记录'}`;
/** Compact per-attempt history: enough to answer "which model ran which round", without raw ids, PIDs or digests. */
const attemptSummary = (attempt, check, integrationCheck, at) => ({
  attemptId: attempt.id, status: attempt.status, phase: attempt.phase ?? null, phaseLabel: phaseLabels[attempt.phase] ?? attempt.phaseLabel ?? null,
  model: attempt.actualModel ?? attempt.selection?.model ?? null, effort: attempt.selection?.effort ?? null,
  profile: attempt.selection?.profile ?? null, reason: attempt.reason || null,
  reviewer: attempt.machineReview ? { status: attempt.machineReview.status ?? null, model: attempt.machineReview.actualModel ?? attempt.reviewerSelection?.model ?? null,
    effort: attempt.reviewerSelection?.effort ?? null } : null,
  captainReview: attempt.review?.verdict ?? null,
  verification: check ? check.status : null, integrationVerification: integrationCheck ? integrationCheck.status : null,
  startedAt: attempt.startedAt ?? null, endedAt: attempt.endedAt ?? null, elapsedMs: elapsed(attempt.startedAt, attempt.endedAt ?? (attempt.status === 'running' ? at : undefined)),
});
export function taskView(task, workspaces = [], at = new Date().toISOString()) {
  const attempt = task.attempts.at(-1), workspace = workspaces.find(item => item.id === attempt?.workspaceId);
  const check = workspace?.verifications?.find(item => item.id === attempt?.verificationId);
  const integrationCheck = workspace?.verifications?.find(item => item.id === attempt?.integration?.verificationId);
  const active = ['running', 'integrating'].includes(task.status);
  const phase = active ? attempt?.phase ?? 'unknown' : task.status;
  return { taskId: task.id, objective: task.objective, title: task.title ?? (task.objective.length > 80 ? task.objective.slice(0, 80) + '…' : task.objective), status: task.status, phase, phaseLabel: phaseLabels[phase] ?? phase,
    target: task.target ?? null, preflight: attempt?.preflight ?? null, failure: task.failure ?? null,
    attemptId: attempt?.id ?? null, attemptCount: task.attempts.length, mode: task.mode,
    // Each attempt carries its own workspaceId; resolving them all against the latest attempt's workspace
    // silently blanked every earlier round's verification status (a passed check from attempt 1 read back
    // as null once attempt 2 existed). History has to stay truthful to be worth storing.
    attempts: (task.attempts ?? []).map(item => {
      const itemWorkspace = workspaces.find(entry => entry.id === item.workspaceId) ?? workspace;
      return attemptSummary(item,
        itemWorkspace?.verifications?.find(entry => entry.id === item.verificationId),
        itemWorkspace?.verifications?.find(entry => entry.id === item.integration?.verificationId), at);
    }),
    model: attempt?.actualModel ?? attempt?.selection?.model ?? null,
    effort: attempt?.selection?.effort ?? null,
    reviewerSelection: attempt?.machineReview ? { model: attempt.machineReview.actualModel ?? attempt.reviewerSelection?.model ?? attempt.machineReview.selection?.model ?? null,
      effort: attempt.reviewerSelection?.effort ?? attempt.machineReview.selection?.effort ?? null } : null,
    nextActor: actionOwner(task.status, phase),
    selectedProfile: attempt?.selection?.profile ?? null, selectionReason: attempt?.selection?.reason ?? null,
    dispatch: attempt?.dispatch ?? null,
    modelConfirmation: attempt?.modelConfirmation ?? null,
    elapsedMs: attempt ? elapsed(attempt.startedAt, attempt.endedAt ?? (task.status === 'running' ? at : undefined)) : null,
    integrationElapsedMs: attempt?.integration ? elapsed(attempt.integration.startedAt, attempt.integration.endedAt ?? (task.status === 'integrating' ? at : undefined)) : null,
    updatedAt: task.updatedAt, recoveryObservedAt: attempt?.recoveryObservedAt ?? null, phases: attempt?.phases ?? [],
    actions: attempt?.actions ?? null,
    reviewerActions: attempt?.machineReview?.actions ?? null,
    // A member can run for many minutes inside one phase (phase only changes on transitions), so the
    // recorded time of the last write is the only honest sign of life. It is NOT a heartbeat: silence
    // means "no new record", which is exactly what the user needs to be able to distinguish.
    staleMs: active && task.updatedAt ? elapsed(task.updatedAt, at) : null,
    stalled: active ? Boolean(task.updatedAt && (Date.parse(at) - Date.parse(task.updatedAt)) > STALE_AFTER_MS) : false,
    memberUsage: usage(attempt?.execution?.usage ?? attempt?.usage), reviewerUsage: usage(attempt?.machineReview?.usage),
    summary: task.result?.summary ?? null, error: task.error ?? null, blockers: task.result?.blockers ?? [], limitations: task.result?.limitations ?? [],
    // The member's raw structured result was already being stored on validation failure (runtime.js:150)
    // but never surfaced, so a schema mismatch gave the captain nothing to act on. Keep it bounded.
    validationFailure: attempt?.validationFailure ? {
      message: attempt.validationFailure.message ?? null,
      truncated: Boolean(attempt.validationFailure.truncated),
      resultExcerpt: typeof attempt.validationFailure.resultExcerpt === 'string' ? attempt.validationFailure.resultExcerpt.slice(0, 2000) : null,
    } : null,
    verification: check ? { status: check.status, exitCode: check.exitCode ?? null, cleanupConfirmed: check.cleanupConfirmed, stdoutPath: check.stdoutPath, stderrPath: check.stderrPath } : null,
    independentReview: attempt?.machineReview?.status ?? null, captainReview: attempt?.review?.verdict ?? null,
    integrationVerification: integrationCheck ? { status: integrationCheck.status, exitCode: integrationCheck.exitCode ?? null, stdoutPath: integrationCheck.stdoutPath, stderrPath: integrationCheck.stderrPath } : null,
    evidence: { workspacePath: workspace?.worktreePath ?? null, patchPath: attempt?.candidate?.patchPath ?? null },
    // Exit confirmation is a recorded fact, and absence is its own answer: `cleanupConfirmed` is written
    // only by finish() (terminal states) and by store recovery. So `undefined` means "no exit receipt is
    // on record yet" — for a running attempt that is honest, and it is why this reads `?? null` rather
    // than `!== false`. The earlier form reported `true` ("exit confirmed") for a live member whose group
    // was demonstrably still running, because `undefined !== false`.
    memberExitConfirmed: attempt ? attempt.cleanupConfirmed ?? null : null,
    // A recorded failure knows *which* stage broke and what to do about it, so it outranks the generic
    // per-status line. The earlier inversion (status first) was aimed at the cancel path, where a
    // phase-level failure was meaningless — but it also discarded specific guidance such as
    // `verification_executable_missing → 安装缺失的验证程序`, replacing it with "检查错误与退出记录".
    // Cancel is repaired at the source (runtime.js no longer records a failure for it) AND guarded here:
    // tasks cancelled before that change still hold a stored `failure`, and nothing migrates them, so
    // reading it back would resurface the very symptom this was written to remove.
    nextAction: (task.status === 'cancelled' ? nextActions.cancelled : task.failure?.nextAction ?? nextActions[task.status]) ?? '检查原始记录', dependencies: task.dependencies };
}
/** Apply observation-only owner rules identically to compact and overview responses. */
export function observedTaskView(task, snapshot, at = new Date().toISOString()) {
  const view = taskView(task, snapshot.workspaces, at);
  if (['running', 'integrating'].includes(task.status) && !snapshot.owner?.processAlive) {
    const attempt = task.attempts.at(-1);
    view.elapsedMs = attempt ? elapsed(attempt.startedAt, attempt.endedAt) : null;
    view.integrationElapsedMs = attempt?.integration ? elapsed(attempt.integration.startedAt, attempt.integration.endedAt) : null;
    for (const history of view.attempts) history.elapsedMs = elapsed(history.startedAt, history.endedAt);
    view.nextActor = '主 Agent（核实进度）';
    view.nextAction = '未检测到记录中的 owner 进程；先检查旧成员进程与任务记录，勿重复启动';
  }
  return view;
}
export function overview(snapshot, { limit = 20, at = new Date().toISOString(), taskIds, projection = 'full', query = '', status = 'all', showHistory = true } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Status limit must be an integer from 1 to 100');
  if (!['full', 'summary', 'catalog'].includes(projection)) throw new Error('Unknown status projection');
  if (typeof query !== 'string' || query.length > 200 || typeof showHistory !== 'boolean' || (status !== 'all' && !Object.hasOwn(nextActions, status))) throw new Error('Invalid status filter');
  if (taskIds !== undefined && (!Array.isArray(taskIds) || taskIds.length > 100 || taskIds.some(id => typeof id !== 'string' || !id || id.length > 256) || new Set(taskIds).size !== taskIds.length)) throw new Error('Provide at most 100 distinct selected taskIds');
  const known = new Set(snapshot.tasks.map(task => task.id));
  if (taskIds?.some(id => !known.has(id))) throw new Error('Selected taskId does not belong to this workspace');
  const selected = taskIds === undefined ? snapshot.tasks : snapshot.tasks.filter(task => taskIds.includes(task.id));
  const count = tasks => {
    const counts = { total: tasks.length, running: 0, awaiting: 0, succeeded: 0, attention: 0, pending: 0 };
    for (const task of tasks) {
    if (['running', 'integrating'].includes(task.status)) counts.running++;
    else if (['awaiting_review', 'awaiting_integration'].includes(task.status)) counts.awaiting++;
    else if (task.status === 'succeeded') counts.succeeded++;
    else if (task.status === 'pending') counts.pending++;
    else counts.attention++;
    }
    return counts;
  };
  const counts = count(selected), projectCounts = count(snapshot.tasks);
  const match = query.toLowerCase();
  const matched = selected.filter(task => (showHistory || ['pending', 'running', 'integrating', 'awaiting_review', 'awaiting_integration'].includes(task.status))
    && (status === 'all' || task.status === status)
    && [task.id, task.title, task.objective, task.attempts.at(-1)?.selection?.model, task.attempts.at(-1)?.actualModel].some(value => String(value ?? '').toLowerCase().includes(match)));
  const ordered = [...matched].sort((a, b) => {
    const rank = task => ['running', 'integrating'].includes(task.status) ? 0 : ['awaiting_review', 'awaiting_integration'].includes(task.status) ? 1 : 2;
    return rank(a) - rank(b) || (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0);
  }).slice(0, limit);
  const tasks = projection === 'summary' ? [] : ordered.map(task => {
    const view = observedTaskView(task, snapshot, at);
    if (projection === 'full') return view;
    return { taskId: view.taskId, title: view.title.slice(0, 120), status: view.status, phase: view.phase, phaseLabel: view.phaseLabel,
      attemptCount: view.attemptCount, elapsedMs: view.elapsedMs, integrationElapsedMs: view.integrationElapsedMs, updatedAt: view.updatedAt };
  });
  const ownerMissing = counts.running > 0 && !snapshot.owner?.processAlive;
  const runtime = projection === 'full' ? snapshot.owner : snapshot.owner ? { pid: snapshot.owner.pid, processAlive: snapshot.owner.processAlive, version: snapshot.owner.version ?? null, sourceRoot: snapshot.owner.sourceRoot ?? null } : null;
  return { capturedAt: at, target: snapshot.target ?? null, viewer: pluginIdentity(), runtime, warning: ownerMissing ? '存在执行中记录，但未检测到 owner 进程。进度需确认；状态查看不会恢复或重派任务。' : null,
    stateExists: snapshot.stateExists, projection, counts, projectCounts, tasks, matchedTotal: matched.length, omitted: matched.length - tasks.length, limit,
    filters: { kind: taskIds === undefined ? 'workspace' : 'selected', query, status, showHistory },
    observation: '这是读取时的快照；状态记录不保证进程正在推进。旧运行时的版本和来源可能未知。' };
}
const seconds = ms => ms === null ? '未知' : `${(ms / 1000).toFixed(1)} 秒`;
// Additive MCP text receipt: the first content block remains the original JSON.
// This describes recorded facts, not a native host card or background notification.
export function toolFeedback(name, value) {
  if (name === 'teams_review' && value?.review && value.taskId) return `Agent Teams · ${value.phaseLabel} [${value.taskId.slice(0, 8)}]\n队长复核：${value.review.verdict} · ${value.review.evidenceCount} 项证据 · ${value.review.authority}\n下一步：${value.nextActor} · ${value.nextAction}\n完整报告和复核证据可用 teams_status(verbose=true) 查询。`;
  if (value?.cursor && value.taskId) {
    if (value.unchanged) return `Agent Teams · 没有新记录\n任务 ${value.taskId.slice(0, 8)} · 最近记录：${value.updatedAt ?? '未知'}\n计时不代表推进；继续独立工作并按需观察。`;
    const phase = value.phaseLabel ?? phaseLabels[value.phase] ?? value.phase ?? '阶段未知';
    const nextActor = value.nextActor ?? '主 Agent';
    const nextAction = String(value.nextAction ?? '核对完整记录后决定下一步').slice(0, 400);
    const elapsedText = Number.isFinite(value.elapsedMs) ? ` · 执行耗时：${seconds(value.elapsedMs)}` : '';
    const error = value.error ? `\n错误：${String(value.error).slice(0, 400)}` : '';
    return `Agent Teams · ${phase}\n任务 ${value.taskId.slice(0, 8)} · 最近记录：${value.updatedAt ?? '未知'}${elapsedText}\n下一步：${nextActor} · ${nextAction}${error}\n按变化摘要核对；完整证据可显式查询，尚需按合同验收。`;
  }
  if (name === 'teams_status' && value?.panel?.url) return `Agent Teams · 实时状态面板已就绪\n${value.panel.url}\n每 2 秒读取本项目状态；请在宿主右侧浏览器面板打开。连接断开后停止服务；此页不是 Codex 原生子 Agent 面板。`;
  if (name === 'teams_models') {
    const selection = value.selection;
    const state = value.status === 'confirmed' ? '模型分工已确认'
      : ['decline', 'cancel'].includes(value.status) ? '本次表单未确认'
      : value.status === 'forgotten' ? '模型分工已撤销'
      : value.confirmationRequired ? '可由队长指定模型' : '已有有效模型分工';
    return [`Agent Teams · ${state}`, '本次调用未启动新成员；队长模型由当前聊天宿主控制。',
      value.workspace ? `目标工作区：${value.workspace}` : '',
      selection ? `复杂任务 / 独立审查：${modelLabel(selection.profiles.expert)}\n简单任务：${modelLabel(selection.profiles.simple ?? selection.profiles.expert)}\n确认范围：${selection.scope === 'workspace' ? '用户已选择记住此工作区' : '本次运行时'}` : '成员模型和推理强度尚未确认。',
      ['decline', 'cancel'].includes(value.status) ? `宿主返回 ${value.status}；无法据此确认表单曾展示或由用户主动拒绝。${selection ? '原有效分工仍保留。' : '没有用户偏好确认。'}队长可在 teams_start 显式传入 models；用户表单为可选设置，不得代填。` :
        value.confirmationRequired ? '下一步：主 Agent 从实际目录选择模型/强度，在 teams_start 传入 models；用户也可通过表单设置偏好。' : '下一步：主 Agent 展示具体任务分工，再启动成员。'].filter(Boolean).join('\n');
  }
  if (name === 'teams_start') return [`Agent Teams 已启动 · ${value.title ?? value.taskId} [${value.taskId.slice(0, 8)}]`,
    `角色：${value.kind === 'review' ? '独立评估 / 审查成员' : value.kind === 'implementation' ? '实现成员' : '分析成员'} · ${modelLabel(value.selection)}`,
    `选择来源：${value.dispatchSource === 'captain-explicit' ? '队长显式指定（本次 attempt）' : value.confirmationScope === 'workspace' ? '用户已选择记住此工作区' : value.confirmationScope === 'runtime-session' ? '用户确认，仅本次运行时' : '未记录'} · 目标工作区：${value.target?.root ?? '未知'}`,
    value.reviewerSelection ? `写任务后续独立审查：${modelLabel(value.reviewerSelection)}` : '',
    '这是启动回执；实际阶段以状态记录为准，尚未验收。下一步：主 Agent 继续自己的分工并跟踪成员结果。'].filter(Boolean).join('\n');
  if (name === 'teams_status' && value.viewer) return `Agent Teams · 只读状态观察（历史记录不代表本轮委派）\n${renderText(value)}`;
  // Accepts a compact taskView, a raw task record, or a task list; never assumes which one arrived.
  const fromView = view => [`Agent Teams · ${view.phaseLabel} · ${view.title} [${view.taskId.slice(0, 8)}]`,
    view.attemptCount ? `成员：${modelLabel(view)} · 执行耗时：${seconds(view.elapsedMs)}` : view.status === 'pending' ? '合同已创建；尚未启动成员。' : '此任务没有成员执行记录。',
    `下一步：${view.nextActor} · ${view.nextAction}`,
    view.staleMs === null || view.staleMs === undefined ? '' : `距上次状态记录：${seconds(view.staleMs)}（记录时间，不是实时心跳）`,
    view.stalled ? '注意：已超过 3 分钟没有新的状态记录。这不等于失败，但也无法据此判断模型正在推进；请结合成员进程和日志判断。' : '',
    view.summary ? `成员结果：${view.summary.slice(0, 500)}` : '',
    view.limitations?.length ? `验证局限：${view.limitations.length} 项（见报告；局限不等于任务受阻）` : '',
    view.validationFailure ? `成员返回的结构不合合同：${view.validationFailure.message ?? '未知原因'}${view.validationFailure.truncated ? '（原始内容过长已截断）' : ''}`
      + (view.validationFailure.resultExcerpt ? `\n原始返回（前 2000 字符）：${view.validationFailure.resultExcerpt}` : '') : '',
    view.status === 'awaiting_review' ? '成员已提交，尚未验收；主 Agent 核对证据，无需额外等待用户批准。' : '',
    view.status === 'awaiting_integration' ? '队长复核已通过，尚未集成；主 Agent 在已有授权范围内继续。' : '',
    view.error ? `错误：${view.error}` : ''].filter(Boolean).join('\n');
  if (value?.phaseLabel && value.taskId) return fromView(value);
  if (value?.objective && Array.isArray(value.attempts)) return fromView(taskView(value));
  if (Array.isArray(value)) return value.length
    ? `Agent Teams · 共 ${value.length} 个任务（只读列表）\n` + value.map(t => `[${String(t.taskId).slice(0, 8)}] ${phaseLabels[t.status] ?? t.status} · ${t.title ?? t.objective}`).join('\n')
    : 'Agent Teams · 尚无任务记录；本次查询未启动新成员。';
  if (name === 'teams_integrate' && value?.taskId) return `Agent Teams · 已请求集成 [${value.taskId.slice(0, 8)}]\n下一步：运行时应用并复验；当前不是已完成状态。`;
  return 'Agent Teams · 只读任务记录；本次查询未启动新成员。';
}
export function renderText(report) {
  return [`Agent Teams · 查看工具 v${report.viewer.version}`, `运行时版本：${report.runtime?.version ?? '未知'} · owner 进程：${report.runtime?.processAlive ? '存在' : '未检测到'}`,
    `目标工作区：${report.target?.root ?? '未知'}`, `查看来源：${report.viewer.sourceRoot}`, `运行来源：${report.runtime?.sourceRoot ?? '未知'}`, `快照：${report.capturedAt}`,
    `任务 ${report.counts.total} · 执行记录 ${report.counts.running} · 待验收/集成 ${report.counts.awaiting} · 已完成 ${report.counts.succeeded} · 需关注 ${report.counts.attention}`,
    report.warning ? '需检查：' + report.warning : '',
    ...report.tasks.map(task => report.projection === 'catalog' ? `[${task.taskId.slice(0, 8)}] ${task.phaseLabel} · ${seconds(task.elapsedMs)} · ${task.title}` : `[${task.taskId.slice(0, 8)}] ${task.phaseLabel} · ${seconds(task.elapsedMs)} · ${modelLabel(task)}\n  ${task.title}\n  下一步：${task.nextActor} · ${task.nextAction}\n  最近记录：${task.updatedAt ?? '未知'}（记录时间，不是实时心跳）${task.staleMs === null || task.staleMs === undefined ? '' : ` · 距上次记录 ${seconds(task.staleMs)}`}${task.stalled ? '\n  注意：已超过 3 分钟没有新的状态记录；这不等于失败，请结合成员进程与日志判断。' : ''}\n  命令验证：${task.verification?.status ?? '未记录'} · 独立审查：${task.independentReview ?? '未记录'} · 队长复核：${task.captainReview ?? '未记录'}${task.summary ? '\n  结果：' + task.summary.slice(0, 160) : ''}${task.error ? '\n  错误：' + task.error : ''}`),
    report.omitted ? `其余 ${report.omitted} 个任务未展示` : '', report.observation].filter(Boolean).join('\n');
}
const escape = value => String(value ?? '未知').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export function renderHtml(report, { live = false } = {}) {
  const filters = report.filters ?? { kind: 'workspace', query: '', status: 'all', showHistory: true };
  const selected = filters.kind === 'selected';
  const scopeLabel = selected ? '本次选定任务' : '项目累计任务';
  const projectTotal = report.projectCounts?.total ?? report.counts.total;
  const matchedTotal = report.matchedTotal ?? report.counts.total;
  const controls = live ? `<select id="scope" aria-label="任务范围">${report.panelSelection === null ? '' : `<option value="selected"${selected ? ' selected' : ''}>本次选定任务</option>`}<option value="all"${selected ? '' : ' selected'}>项目全部</option></select><label><input id="history" type="checkbox"${filters.showHistory ? ' checked' : ''}>展开历史终态</label>` : '';

  const cards = report.tasks.map(task => `<article class="task" data-task-id="${escape(task.taskId)}" data-status="${escape(task.status)}"><div class="row"><span class="badge">${escape(task.phaseLabel)}</span><span class="muted">${escape(task.taskId.slice(0, 8))} · 第 ${task.attemptCount} 轮</span></div><h2>${escape(task.title)}</h2><p class="muted">${escape(modelLabel(task))} · 本轮执行 ${seconds(task.elapsedMs)}${task.integrationElapsedMs === null ? '' : ' · 集成 ' + seconds(task.integrationElapsedMs)}</p><p class="next">下一步：${escape(task.nextActor)} · ${escape(task.nextAction)}</p><p class="muted">最近记录：${escape(task.updatedAt ?? '未知')}（记录时间，不是实时心跳）${task.staleMs === null || task.staleMs === undefined ? '' : ' · 距上次记录 ' + seconds(task.staleMs)}</p>${task.stalled ? '<p class="notice">已超过 3 分钟没有新的状态记录。这不等于失败，但也无法据此判断模型正在推进；请结合成员进程与日志判断。</p>' : ''}${task.error ? `<p class="error">${escape(task.error)}</p>` : ''}<details><summary>阶段、结果与证据</summary><p class="muted">任务说明：${escape(task.objective)}</p><ol>${task.phases.map(phase => `<li>${escape(phaseLabels[phase.phase] ?? phase.phase)} <span class="muted">${phase.observedAt ? '恢复观察：' + escape(phase.observedAt) : escape(phase.startedAt)}${phase.interrupted ? ' · 中断，结束时间未知' : ''}${phase.endedAt ? ' → ' + escape(phase.endedAt) : ''}</span></li>`).join('') || '<li>旧记录没有阶段时间线</li>'}</ol><p>${escape(task.summary ?? '尚无成员结果')}</p><pre>${escape(JSON.stringify({ target: task.target, preflight: task.preflight, failure: task.failure, selectedProfile: task.selectedProfile, selectionReason: task.selectionReason, modelConfirmation: task.modelConfirmation, dispatch: task.dispatch, memberUsage: task.memberUsage, reviewerUsage: task.reviewerUsage, verification: task.verification, independentReview: task.independentReview, captainReview: task.captainReview, integrationVerification: task.integrationVerification, evidence: task.evidence, blockers: task.blockers, limitations: task.limitations, actions: task.actions, reviewerActions: task.reviewerActions }, null, 2))}</pre></details></article>`).join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src ${live ? "'self'" : "'none'"}; img-src 'none'; base-uri 'none'; form-action 'none'"><title>Agent Teams · 运行状态</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f4f6f9;color:#19283a;font:15px/1.65 system-ui,-apple-system,sans-serif}main{max-width:1060px;margin:0 auto;padding:40px 24px}header{margin-bottom:26px}.eyebrow{color:#406353;font-weight:650;letter-spacing:.12em}h1{font-size:34px;line-height:1.3;margin:8px 0}h2{font-size:18px;font-weight:600;overflow-wrap:anywhere}p{margin:10px 0}.muted{color:#647487;font-size:13px}.notice{padding:14px 18px;background:#eaf0f5;border-left:3px solid #788ea7;border-radius:5px}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:24px 0}.stat{padding:18px;border:1px solid #dfe5ed;background:white;border-radius:12px}.stat strong{display:block;font-size:30px;font-weight:600}.toolbar{display:flex;gap:12px;margin:24px 0}input,select{font:inherit;border:1px solid #cbd5e1;border-radius:8px;padding:10px 12px;background:white}input{flex:1;min-width:0}.task{background:white;border:1px solid #dfe5ed;padding:22px;border-radius:12px;margin:14px 0}.row{display:flex;justify-content:space-between;gap:12px;align-items:center}.badge{color:#315d48;background:#eaf4ee;border-radius:20px;padding:3px 12px;font-size:13px}.task[data-status="failed"] .badge,.task[data-status="integration_failed"] .badge,.task[data-status="timed_out"] .badge{color:#90402b;background:#fff0e9}.next{font-size:14px}.error{color:#90402b;white-space:pre-wrap;overflow-wrap:anywhere}summary{cursor:pointer;font-weight:550;color:#3f586d}details{border-top:1px solid #e8edf2;padding-top:12px;margin-top:16px}pre{font-size:12px;background:#f4f6f9;padding:16px;border-radius:8px;white-space:pre-wrap;overflow-wrap:anywhere}li{margin:8px 0}footer{margin-top:28px;color:#647487;font-size:13px}code{overflow-wrap:anywhere}[hidden]{display:none!important}@media(max-width:620px){main{padding:24px 16px}h1{font-size:28px}.stats{grid-template-columns:repeat(2,1fr)}.toolbar,.row{flex-wrap:wrap}.task{padding:16px}}
  </style></head><body><main data-limit="${report.limit ?? 20}"><header><div class="eyebrow">CODEX AGENT TEAMS</div><h1>任务运行状态</h1>${live ? '<p id="connection" class="notice" role="status">实时读取 · 每 2 秒更新 · MCP 连接关闭后停止</p>' : ''}<p>查看工具 v${escape(report.viewer.version)} · 运行时 ${escape(report.runtime?.version ?? '版本未知')} · owner 进程${report.runtime?.processAlive ? '存在' : '未检测到'}</p><p class="muted">目标工作区：<code>${escape(report.target?.root)}</code></p><p class="muted">快照生成于 ${escape(report.capturedAt)}</p></header><p class="notice">${live ? '本页持续读取任务记录。阶段和最近记录来自运行时；耗时增长不证明成员正在推进。此页不提供模型思维或 Codex 原生子 Agent 面板。' : '这是本地状态快照。重新执行导出命令才能获取新记录；刷新页面不会重新读取数据库。旧运行时可能没有版本或阶段信息。'}</p>${report.warning ? `<p class="error notice">${escape(report.warning)}</p>` : ''}<section class="stats">${[[scopeLabel, report.counts.total], ['执行中记录', report.counts.running], ['待验收 / 集成', report.counts.awaiting], ['已完成并验收', report.counts.succeeded]].map(([label, value]) => `<div class="stat"><span class="muted">${label}</span><strong>${value}</strong></div>`).join('')}</section><p class="muted">项目累计 ${projectTotal} 条 · ${selected ? `选定 ${report.counts.total} 条（显式任务集合，不代表自动识别宿主会话） · ` : ''}历史失败/受阻等 ${report.counts.attention} 条（本范围记录，非当前运行数）</p><div class="toolbar">${controls}<input id="search" type="search" aria-label="搜索任务" placeholder="搜索任务、模型或编号" value="${escape(filters.query)}"><select id="filter" aria-label="筛选任务状态"><option value="all"${filters.status === 'all' ? ' selected' : ''}>全部状态</option>${Object.entries(phaseLabels).filter(([key]) => ['pending','succeeded','failed','timed_out','cancelled','blocked','awaiting_review','awaiting_integration','integration_failed'].includes(key)).map(([key,label])=>`<option value="${key}"${filters.status === key ? ' selected' : ''}>${label}</option>`).join('')}<option value="running"${filters.status === 'running' ? ' selected' : ''}>执行中</option><option value="integrating"${filters.status === 'integrating' ? ' selected' : ''}>正在集成</option></select></div><section id="tasks">${cards || (projectTotal ? '<p>当前筛选没有任务；可切换范围或展开历史终态。</p>' : '<p>尚无团队任务记录。安装插件不会自动创建任务。</p>')}</section><p id="empty" hidden>没有符合筛选条件的任务。</p><footer><p id="visible-count">展示 ${report.tasks.length} / 匹配 ${matchedTotal} 条 · ${scopeLabel} ${report.counts.total} 条 · 项目累计 ${projectTotal} 条。执行中与待验收优先。</p><p>${live ? '搜索和状态筛选覆盖当前范围全部记录，再按上限展示。' : '离线搜索仅覆盖本页已载入任务。'}${report.omitted ? ` 尚有 ${report.omitted} 条未展示；${live && report.limit < 100 ? '可显示更多，或缩小搜索范围。<button id="more" type="button">显示更多</button>' : '请缩小搜索范围或提高展示上限（最多100条）。'}` : ''}</p><details id="environment"><summary>环境与安装来源</summary><p>查看来源：<code>${escape(report.viewer.sourceRoot)}</code><br>运行来源：<code>${escape(report.runtime?.sourceRoot ?? '未知')}</code></p></details><p>未知用量保持未知；缓存输入包含在输入用量中。状态查看不会启动成员、复核或集成。</p></footer></main><script>
  let refreshTimer, refreshSequence=0;
  function bind(){
    const search=document.getElementById('search'),filter=document.getElementById('filter'),tasks=[...document.querySelectorAll('.task')];
    ${live ? `function update(){
      const url=new URL(location.href);url.searchParams.set('q',search.value);url.searchParams.set('status',filter.value);
      url.searchParams.set('view',document.getElementById('scope').value);url.searchParams.set('history',document.getElementById('history').checked?'1':'0');
      history.replaceState(null,'',url);clearTimeout(refreshTimer);refreshSequence++;refreshTimer=setTimeout(refresh,150);
    }
    document.getElementById('scope').addEventListener('change',()=>{document.getElementById('history').checked=document.getElementById('scope').value==='selected';update()});
    document.getElementById('history').addEventListener('change',update);
    document.getElementById('more')?.addEventListener('click',()=>{const url=new URL(location.href);url.searchParams.set('limit',Math.min(100,Number(document.querySelector('main').dataset.limit)+20));history.replaceState(null,'',url);clearTimeout(refreshTimer);refreshSequence++;refreshTimer=setTimeout(refresh,0)});`
    : `function update(){const query=search.value.toLowerCase();let count=0;for(const task of tasks){task.hidden=!(task.textContent.toLowerCase().includes(query)&&(filter.value==='all'||task.dataset.status===filter.value));if(!task.hidden)count++}document.getElementById('empty').hidden=count>0||tasks.length===0;document.getElementById('visible-count').textContent='当前显示 '+count+' / 已载入 '+tasks.length+' 条；项目累计 ${projectTotal} 条'}update();`}
    search.addEventListener('input',update);filter.addEventListener('change',update);
  }bind();
  ${live ? `async function refresh(){
    const sequence=++refreshSequence,url=location.pathname+location.search;
    try {
      const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(5000)});
      if(!response.ok)throw new Error('Status unavailable');
      const html=await response.text();if(sequence!==refreshSequence||url!==location.pathname+location.search)return;
      const next=new DOMParser().parseFromString(html,'text/html').querySelector('main');
      if(!next||!next.querySelector('#connection'))throw new Error('Invalid status page');
      const search=document.getElementById('search'),focused=document.activeElement.id,selection=[search.selectionStart,search.selectionEnd];
      const expandedDetails=[...document.querySelectorAll('details[id]')].filter(item=>item.open).map(item=>item.id);
      const expanded=[...document.querySelectorAll('.task')].filter(task=>task.querySelector('details').open).map(task=>task.dataset.taskId);
      for(const task of next.querySelectorAll('.task'))if(expanded.includes(task.dataset.taskId))task.querySelector('details').open=true;
      for(const id of expandedDetails)if(next.querySelector('#'+id))next.querySelector('#'+id).open=true;
      document.querySelector('main').replaceWith(next);bind();
      if(['search','filter','scope','history'].includes(focused)){document.getElementById(focused).focus({preventScroll:true});if(focused==='search')document.getElementById('search').setSelectionRange(...selection)}
    }catch{if(sequence===refreshSequence){const notice=document.getElementById('connection');notice.className='notice error';notice.textContent='连接中断或状态读取失败 · 当前显示为上次成功读取的记录 · 正在重试';}}
    finally{if(sequence===refreshSequence){clearTimeout(refreshTimer);refreshTimer=setTimeout(refresh,document.hidden?5000:2000)}}
  }refreshTimer=setTimeout(refresh,2000);` : ''}
  </script></body></html>\n`;
}
