import { accessSync, constants, realpathSync, statSync } from 'node:fs';
import { delimiter, isAbsolute, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { z } from 'zod';
import { scopedPath } from './workspace.js';

export const preflightSchema = z.strictObject({
  requiredFiles: z.array(scopedPath).max(50).default([]),
  nodeModules: z.array(z.string().regex(/^(?:@[a-zA-Z0-9_-]+\/)?[a-zA-Z0-9_-][a-zA-Z0-9._-]*$/)).max(50).default([]),
});

export function preflightError(code, message, nextAction, evidence) {
  const error = new Error(message);
  error.detail = { code, phase: 'preflight', nextAction, ...(evidence ? { evidence } : {}) };
  return error;
}

// Distinct causes that the phase bucket alone would flatten into one unactionable "member_failed".
// Codes come from app-server.js (hostError) so classification never pattern-matches message text.
const hostFailures = {
  host_model_changed: ['host_model_changed', '宿主切换了实际模型，与已确认分工不一致。重新确认模型分工后显式重试；不要沿用本次结果。'],
  host_cwd_unconfirmed: ['host_cwd_unconfirmed', '宿主未确认请求的工作目录，已拒绝启动推理。核对 MCP 的 cwd 与目标工作区配置后重试。'],
  host_permissions_unconfirmed: ['host_permissions_unconfirmed', '宿主未确认沙箱与批准策略，已拒绝启动推理。检查宿主权限配置；不要绕过该门禁。'],
  model_unavailable: ['member_model_unavailable', '配置的模型在当前目录不可见。重新运行 teams_models 确认可用模型后重试。'],
  effort_unsupported: ['member_effort_unsupported', '所选推理强度不被该模型支持。重新确认模型与强度组合后重试。'],
  skill_or_mcp_missing: ['host_setup_incomplete', '宿主未发现本插件的技能或 MCP server。按 README 重装/重启宿主后重试；不要降级为无技能执行。'],
  output_schema_invalid: ['member_output_schema_invalid', '输出 schema 本地检查失败，尚未启动成员。修复合同或生成 schema，核对宿主实际插件版本与缓存；不要直接重试同一请求。'],
  request_rejected: ['member_request_rejected', '宿主明确拒绝了请求。检查原始错误、输出 schema 和模型配置，核对实际插件版本与缓存；修复原因后再显式重试。'],
  turn_incomplete: ['member_turn_incomplete', '成员回合未正常完成（可能被中断或模型报错）。查看原始错误与退出记录，确认证据后再显式重试。'],
  no_structured_result: ['member_no_result', '成员完成但没有返回结构化结果。检查成员提示与输出约束；不要接受缺失的结果。'],
};

export function executionFailure(error, phase) {
  if (error?.detail) return error.detail;
  const hostCode = error?.hostCode ?? error?.cause?.hostCode;
  if (hostCode && hostFailures[hostCode]) return { code: hostFailures[hostCode][0], phase, nextAction: hostFailures[hostCode][1] };
  const actions = {
    preparing: ['workspace_preparation_failed', '核对 Git 基线、未提交改动和工作区限制；尚未启动成员。'],
    preflight: ['preflight_failed', '核对任务声明的验证程序与依赖文件；预检不会自动安装或复制文件。'],
    member: ['member_failed', '检查成员的原始错误与退出记录；明确新证据后再重试。'],
    auditing: ['audit_failed', '检查改动范围和源工作区变化；不要沿用旧补丁或验收。'],
    verification: ['verification_failed', '检查本轮命令退出码、stdout/stderr 和退出确认；修复后重新验证。'],
    independent_review: ['independent_review_failed', '检查独立审查报告及错误；修复后重新验证和审查。'],
  };
  const [code, nextAction] = actions[phase] ?? ['execution_failed', '查看原始错误、阶段与退出记录，再决定是否显式重试。'];
  return { code, phase, nextAction };
}

/** Resolve only; never execute repository code, install dependencies or run baseline tests. */
export function inspectExecution(plan, cwd) {
  const command = plan.verification.command;
  // Node's Unix spawn uses this default only when PATH is absent; empty PATH searches cwd.
  const candidates = isAbsolute(command) || command.includes('/') ? [resolve(cwd, command)]
    : (process.env.PATH ?? '/usr/bin:/bin').split(delimiter).map(dir => resolve(cwd, dir, command));
  let executable;
  for (const path of candidates) {
    try { if (statSync(path).isFile()) { accessSync(path, constants.X_OK); executable = realpathSync(path); break; } }
    catch { /* Continue searching the same PATH used by verification. */ }
  }
  if (!executable) throw preflightError('verification_executable_missing', `Verification executable unavailable: ${command}`,
    '安装或明确配置验证程序后再重试；尚未启动成员。');
  const evidence = { cwd: realpathSync(cwd), command, executable, files: [], nodeModules: [], checkedAt: new Date().toISOString() };
  for (const name of plan.preflight?.requiredFiles ?? []) {
    try {
      const path = resolve(cwd, name);
      if (!statSync(path).isFile()) throw new Error('Not a file');
      accessSync(path, constants.R_OK);
      evidence.files.push({ name, resolvedPath: realpathSync(path) });
    } catch { throw preflightError('required_file_missing', `Required file unavailable in execution workspace: ${name}`,
      '核对任务声明与 worktree 内的依赖文件；不会复制 ignored 文件或安装依赖。', evidence); }
  }
  const require = createRequire(join(cwd, 'package.json'));
  for (const name of plan.preflight?.nodeModules ?? []) {
    try { evidence.nodeModules.push({ name, resolvedPath: require.resolve(name) }); }
    catch { throw preflightError('node_module_unresolved', `Node require resolution failed in execution workspace: ${name}`,
      '检查声明依赖及解析条件；纯 ESM/import 条件不由此检查保证，不会自动安装。', evidence); }
  }
  return evidence;
}
