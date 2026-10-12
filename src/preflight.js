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

export function executionFailure(error, phase) {
  if (error.detail) return error.detail;
  const actions = {
    preparing: ['workspace_preparation_failed', '核对 Git 基线、未提交改动和工作区限制；尚未启动成员。'],
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
  const candidates = isAbsolute(command) || command.includes('/') ? [resolve(cwd, command)]
    : (process.env.PATH ?? '').split(delimiter).map(dir => resolve(cwd, dir, command));
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
