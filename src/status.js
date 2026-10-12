import packageInfo from '../package.json' with { type: 'json' };
import { DatabaseSync } from 'node:sqlite';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { processAlive } from './store.js';

const root = fileURLToPath(new URL('../', import.meta.url));
export const phaseLabels = {
  pending: '等待启动', preparing: '准备工作区', member: '成员执行', auditing: '检查改动',
  verification: '命令验证', independent_review: '独立审查', awaiting_review: '等待队长复核',
  awaiting_integration: '等待集成', applying: '应用补丁', integration_verification: '源工作区复验',
  succeeded: '已完成并验收', failed: '执行失败', blocked: '任务受阻', cancelled: '已取消',
  interrupted: '执行中断', integration_failed: '集成失败，需检查现场', unknown: '阶段未知',
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
  const path = join(workspace, '.codex-teams', 'state.sqlite');
  if (!existsSync(path)) {
    if (taskId) throw new Error(`Unknown task: ${taskId}`);
    return { tasks: [], workspaces: [], owner: null, stateExists: false };
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
    return { tasks: tasks.map(row => JSON.parse(row.data)), workspaces: workspaces.map(row => JSON.parse(row.data)),
      owner: owner ? { pid: owner.pid, processAlive: processAlive(owner.pid), version: owner.version ?? null, sourceRoot: owner.sourceRoot ?? null } : null, stateExists: true };
  } finally { db.close(); }
}
const elapsed = (start, end) => Number.isFinite(Date.parse(start)) && Number.isFinite(Date.parse(end)) ? Math.max(0, Date.parse(end) - Date.parse(start)) : null;
const usage = value => value?.total ? Object.fromEntries(['totalTokens', 'inputTokens', 'cachedInputTokens', 'outputTokens'].map(key => [key, value.total[key] ?? null])) : null;
const nextActions = { pending: '明确任务合同后启动', running: '等待当前阶段完成', integrating: '等待源工作区复验',
  awaiting_review: '逐项核对证据，再执行队长复核', awaiting_integration: '检查源工作区与补丁，再显式集成',
  succeeded: '查看结果与验证证据', failed: '检查错误与退出记录，再明确重试理由', blocked: '补充缺失上下文或重新规划',
  cancelled: '确认退出后按需重新规划', interrupted: '检查旧进程与证据，再显式重试', integration_failed: '检查已应用的源改动和日志，禁止盲目重放' };
export function taskView(task, workspaces = [], at = new Date().toISOString()) {
  const attempt = task.attempts.at(-1), workspace = workspaces.find(item => item.id === attempt?.workspaceId);
  const check = workspace?.verifications?.find(item => item.id === attempt?.verificationId);
  const integrationCheck = workspace?.verifications?.find(item => item.id === attempt?.integration?.verificationId);
  const active = ['running', 'integrating'].includes(task.status);
  const phase = active ? attempt?.phase ?? 'unknown' : task.status;
  return { taskId: task.id, objective: task.objective, title: task.objective.length > 100 ? task.objective.slice(0, 100) + '…' : task.objective, status: task.status, phase, phaseLabel: phaseLabels[phase] ?? phase,
    attemptId: attempt?.id ?? null, attemptCount: task.attempts.length, mode: task.mode,
    model: attempt?.actualModel ?? attempt?.selection?.model ?? null,
    elapsedMs: attempt ? elapsed(attempt.startedAt, attempt.endedAt ?? (task.status === 'running' ? at : undefined)) : null,
    integrationElapsedMs: attempt?.integration ? elapsed(attempt.integration.startedAt, attempt.integration.endedAt ?? (task.status === 'integrating' ? at : undefined)) : null,
    updatedAt: task.updatedAt, phases: attempt?.phases ?? [],
    memberUsage: usage(attempt?.execution?.usage ?? attempt?.usage), reviewerUsage: usage(attempt?.machineReview?.usage),
    summary: task.result?.summary ?? null, error: task.error ?? null, blockers: task.result?.blockers ?? [],
    verification: check ? { status: check.status, exitCode: check.exitCode ?? null, cleanupConfirmed: check.cleanupConfirmed, stdoutPath: check.stdoutPath, stderrPath: check.stderrPath } : null,
    independentReview: attempt?.machineReview?.status ?? null, captainReview: attempt?.review?.verdict ?? null,
    integrationVerification: integrationCheck ? { status: integrationCheck.status, exitCode: integrationCheck.exitCode ?? null, stdoutPath: integrationCheck.stdoutPath, stderrPath: integrationCheck.stderrPath } : null,
    evidence: { workspacePath: workspace?.worktreePath ?? null, patchPath: attempt?.candidate?.patchPath ?? null },
    nextAction: nextActions[task.status] ?? '检查原始记录', dependencies: task.dependencies };
}
export function overview(snapshot, { limit = 20, at = new Date().toISOString() } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Status limit must be an integer from 1 to 100');
  const counts = { total: snapshot.tasks.length, running: 0, awaiting: 0, succeeded: 0, attention: 0, pending: 0 };
  for (const task of snapshot.tasks) {
    if (['running', 'integrating'].includes(task.status)) counts.running++;
    else if (['awaiting_review', 'awaiting_integration'].includes(task.status)) counts.awaiting++;
    else if (task.status === 'succeeded') counts.succeeded++;
    else if (task.status === 'pending') counts.pending++;
    else counts.attention++;
  }
  const tasks = [...snapshot.tasks].sort((a, b) => {
    const rank = task => ['running', 'integrating'].includes(task.status) ? 0 : ['awaiting_review', 'awaiting_integration'].includes(task.status) ? 1 : 2;
    return rank(a) - rank(b) || (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0);
  }).slice(0, limit).map(task => taskView(task, snapshot.workspaces, at));
  const ownerMissing = counts.running > 0 && !snapshot.owner?.processAlive;
  if (ownerMissing) for (const task of tasks) {
    if (!['running', 'integrating'].includes(task.status)) continue;
    const attempt = snapshot.tasks.find(item => item.id === task.taskId)?.attempts.at(-1);
    task.elapsedMs = attempt ? elapsed(attempt.startedAt, attempt.endedAt) : null;
    task.integrationElapsedMs = attempt?.integration ? elapsed(attempt.integration.startedAt, attempt.integration.endedAt) : null;
    task.nextAction = '未检测到记录中的 owner 进程；先检查旧成员进程与任务记录，勿重复启动';
  }
  return { capturedAt: at, viewer: pluginIdentity(), runtime: snapshot.owner, warning: ownerMissing ? '存在执行中记录，但未检测到 owner 进程。进度需确认；状态查看不会恢复或重派任务。' : null,
    stateExists: snapshot.stateExists, counts, tasks, omitted: snapshot.tasks.length - tasks.length,
    observation: '这是读取时的快照；状态记录不保证进程正在推进。旧运行时的版本和来源可能未知。' };
}
const seconds = ms => ms === null ? '未知' : `${(ms / 1000).toFixed(1)} 秒`;
export function renderText(report) {
  return [`Agent Teams · 查看工具 v${report.viewer.version}`, `运行时版本：${report.runtime?.version ?? '未知'} · owner 进程：${report.runtime?.processAlive ? '存在' : '未检测到'}`,
    `查看来源：${report.viewer.sourceRoot}`, `运行来源：${report.runtime?.sourceRoot ?? '未知'}`, `快照：${report.capturedAt}`,
    `任务 ${report.counts.total} · 执行记录 ${report.counts.running} · 待验收/集成 ${report.counts.awaiting} · 已完成 ${report.counts.succeeded} · 需关注 ${report.counts.attention}`,
    report.warning ? '需检查：' + report.warning : '',
    ...report.tasks.map(task => `[${task.taskId.slice(0, 8)}] ${task.phaseLabel} · ${seconds(task.elapsedMs)} · ${task.model ?? '模型未知'}\n  ${task.title}\n  ${task.nextAction}\n  命令验证：${task.verification?.status ?? '未记录'} · 独立审查：${task.independentReview ?? '未记录'} · 队长复核：${task.captainReview ?? '未记录'}${task.summary ? '\n  结果：' + task.summary.slice(0, 160) : ''}${task.error ? '\n  错误：' + task.error : ''}`),
    report.omitted ? `其余 ${report.omitted} 个任务未展示` : '', report.observation].filter(Boolean).join('\n');
}
const escape = value => String(value ?? '未知').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export function renderHtml(report) {
  const cards = report.tasks.map(task => `<article class="task" data-status="${escape(task.status)}"><div class="row"><span class="badge">${escape(task.phaseLabel)}</span><span class="muted">${escape(task.taskId.slice(0, 8))} · 第 ${task.attemptCount} 轮</span></div><h2>${escape(task.title)}</h2><p class="muted">${escape(task.model ?? '模型未知')} · 本轮执行 ${seconds(task.elapsedMs)}${task.integrationElapsedMs === null ? '' : ' · 集成 ' + seconds(task.integrationElapsedMs)}</p><p class="next">${escape(task.nextAction)}</p>${task.error ? `<p class="error">${escape(task.error)}</p>` : ''}<details><summary>阶段、结果与证据</summary><p class="muted">任务说明：${escape(task.objective)}</p><ol>${task.phases.map(phase => `<li>${escape(phaseLabels[phase.phase] ?? phase.phase)} <span class="muted">${escape(phase.startedAt)}${phase.endedAt ? ' → ' + escape(phase.endedAt) : ''}</span></li>`).join('') || '<li>旧记录没有阶段时间线</li>'}</ol><p>${escape(task.summary ?? '尚无成员结果')}</p><pre>${escape(JSON.stringify({ memberUsage: task.memberUsage, reviewerUsage: task.reviewerUsage, verification: task.verification, independentReview: task.independentReview, captainReview: task.captainReview, integrationVerification: task.integrationVerification, evidence: task.evidence, blockers: task.blockers }, null, 2))}</pre></details></article>`).join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; base-uri 'none'; form-action 'none'"><title>Agent Teams · 运行状态</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f4f6f9;color:#19283a;font:15px/1.65 system-ui,-apple-system,sans-serif}main{max-width:1060px;margin:0 auto;padding:40px 24px}header{margin-bottom:26px}.eyebrow{color:#406353;font-weight:650;letter-spacing:.12em}h1{font-size:34px;line-height:1.3;margin:8px 0}h2{font-size:18px;font-weight:600;overflow-wrap:anywhere}p{margin:10px 0}.muted{color:#647487;font-size:13px}.notice{padding:14px 18px;background:#eaf0f5;border-left:3px solid #788ea7;border-radius:5px}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:24px 0}.stat{padding:18px;border:1px solid #dfe5ed;background:white;border-radius:12px}.stat strong{display:block;font-size:30px;font-weight:600}.toolbar{display:flex;gap:12px;margin:24px 0}input,select{font:inherit;border:1px solid #cbd5e1;border-radius:8px;padding:10px 12px;background:white}input{flex:1;min-width:0}.task{background:white;border:1px solid #dfe5ed;padding:22px;border-radius:12px;margin:14px 0}.row{display:flex;justify-content:space-between;gap:12px;align-items:center}.badge{color:#315d48;background:#eaf4ee;border-radius:20px;padding:3px 12px;font-size:13px}.task[data-status="failed"] .badge,.task[data-status="integration_failed"] .badge{color:#90402b;background:#fff0e9}.next{font-size:14px}.error{color:#90402b;white-space:pre-wrap;overflow-wrap:anywhere}summary{cursor:pointer;font-weight:550;color:#3f586d}details{border-top:1px solid #e8edf2;padding-top:12px;margin-top:16px}pre{font-size:12px;background:#f4f6f9;padding:16px;border-radius:8px;white-space:pre-wrap;overflow-wrap:anywhere}li{margin:8px 0}footer{margin-top:28px;color:#647487;font-size:13px}code{overflow-wrap:anywhere}[hidden]{display:none!important}@media(max-width:620px){main{padding:24px 16px}h1{font-size:28px}.stats{grid-template-columns:repeat(2,1fr)}.toolbar,.row{flex-wrap:wrap}.task{padding:16px}}
  </style></head><body><main><header><div class="eyebrow">CODEX AGENT TEAMS</div><h1>任务运行状态</h1><p>查看工具 v${escape(report.viewer.version)} · 运行时 ${escape(report.runtime?.version ?? '版本未知')} · owner 进程${report.runtime?.processAlive ? '存在' : '未检测到'}</p><p class="muted">快照生成于 ${escape(report.capturedAt)}</p></header><p class="notice">这是本地状态快照。重新执行导出命令才能获取新记录；刷新页面不会重新读取数据库。旧运行时可能没有版本或阶段信息。</p>${report.warning ? `<p class="error notice">${escape(report.warning)}</p>` : ''}<section class="stats">${[['任务总数', report.counts.total], ['执行中记录', report.counts.running], ['待验收 / 集成', report.counts.awaiting], ['已完成并验收', report.counts.succeeded]].map(([label, value]) => `<div class="stat"><span class="muted">${label}</span><strong>${value}</strong></div>`).join('')}</section><div class="toolbar"><input id="search" type="search" aria-label="搜索任务" placeholder="搜索任务、模型或编号"><select id="filter" aria-label="筛选任务状态"><option value="all">全部状态</option>${Object.entries(phaseLabels).filter(([key]) => ['pending','succeeded','failed','cancelled','blocked','awaiting_review','awaiting_integration','integration_failed'].includes(key)).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}<option value="running">执行中</option><option value="integrating">正在集成</option></select></div><section id="tasks">${cards || '<p>尚无团队任务记录。安装插件不会自动创建任务。</p>'}</section><p id="empty" hidden>没有符合筛选条件的任务。</p><footer><p>展示 ${report.tasks.length} / ${report.counts.total} 个任务，执行中与待验收优先。</p><p>查看来源：<code>${escape(report.viewer.sourceRoot)}</code><br>运行来源：<code>${escape(report.runtime?.sourceRoot ?? '未知')}</code></p><p>未知用量保持未知；缓存输入包含在输入用量中。状态查看不会启动成员、复核或集成。</p></footer></main><script>
  const search=document.getElementById('search'),filter=document.getElementById('filter'),tasks=[...document.querySelectorAll('.task')];
  function update(){const query=search.value.toLowerCase();let count=0;for(const task of tasks){task.hidden=!(task.textContent.toLowerCase().includes(query)&&(filter.value==='all'||task.dataset.status===filter.value));if(!task.hidden)count++}document.getElementById('empty').hidden=count>0||tasks.length===0}
  search.addEventListener('input',update);filter.addEventListener('change',update);
  </script></body></html>\n`;
}
