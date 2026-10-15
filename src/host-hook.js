import { createHash } from 'node:crypto';
import { appendFileSync, chmodSync, existsSync, lstatSync, readFileSync, unlinkSync, openSync, closeSync, constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { lifecycleRequest } from './host-lifecycle.js';
import { pathToFileURL } from 'node:url';

const registry = sessionId => join(tmpdir(), `teams-session-${createHash('sha256').update(sessionId).digest('hex')}.jsonl`);
const readSafe = (path, limit) => {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o077) || stat.size > limit) throw new Error('Unsafe host lifecycle metadata');
  return readFileSync(path, 'utf8');
};
export async function handleHostHook(input) {
  if (typeof input.session_id !== 'string' || !input.session_id || input.session_id.length > 256) throw new Error('Missing host session id');
  const request = { event: input.hook_event_name, sessionId: input.session_id, turnId: input.turn_id };
  const path = registry(input.session_id);
  if (input.hook_event_name === 'PreToolUse') {
    if (!/^mcp__codex[-_]agent[-_]teams__teams_(start|integrate)$/.test(input.tool_name)) return {};
    const args = input.tool_input;
    if (!args || typeof args.taskId !== 'string') throw new Error('Missing task id');
    const workspace = args.workspace;
    if (typeof workspace !== 'string' || !isAbsolute(workspace)) throw new Error('workspace is required: supply the absolute task target.root for start/integrate; chat cwd is not a substitute');
    const endpoint = JSON.parse(readSafe(join(workspace, '.codex-teams', 'host-control.json'), 4096));
    // Register before bind: an Interrupt racing with bind reaches this endpoint.
    const line = JSON.stringify(endpoint);
    const previous = existsSync(path) ? readSafe(path, 64 * 1024) : '';
    if (!previous.split('\n').includes(line)) {
      const fd = openSync(path, constants.O_CREAT | constants.O_APPEND | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      try { appendFileSync(fd, line + '\n'); } finally { closeSync(fd); }
      chmodSync(path, 0o600);
    }
    const receipt = await lifecycleRequest(endpoint, { ...request, event: 'bind', taskId: args.taskId, workspace });
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput: { ...args, hostTicket: receipt.ticket } } };
  }
  if (!['Interrupt', 'SessionEnd'].includes(input.hook_event_name) || !existsSync(path)) return {};
  const endpoints = [...new Map(readSafe(path, 64 * 1024).trim().split('\n').filter(Boolean).map(line => {
    const endpoint = JSON.parse(line); return [endpoint.socket, endpoint];
  })).values()];
  const results = await Promise.allSettled(endpoints.map(endpoint => lifecycleRequest(endpoint, request)));
  const failures = results.filter(result => result.status === 'rejected');
  if (failures.length || results.some(result => result.status === 'fulfilled' && !result.value.exitConfirmed)) {
    return { systemMessage: 'Agent Teams 已请求停止所属成员，但尚未取得全部退出确认；请检查任务状态，勿重复启动。' };
  }
  if (input.hook_event_name === 'SessionEnd') unlinkSync(path);
  return {};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let text = '';
  try {
    for await (const chunk of process.stdin) { text += chunk; if (text.length > 64 * 1024) throw new Error('Hook input exceeded limit'); }
    const input = JSON.parse(text);
    try { console.log(JSON.stringify(await handleHostHook(input))); }
    catch (error) {
      if (input.hook_event_name === 'PreToolUse') {
        console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `Agent Teams 无法绑定停止事件：${error.message}。重连后先调用 teams_wait({workspace,taskId,timeoutMs:0}) 初始化该项目 owner，再重试；退出未确认时先检查旧进程。` } }));
      } else { console.log(JSON.stringify({ systemMessage: `Agent Teams 停止确认失败：${error.message}` })); process.exitCode = 1; }
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
