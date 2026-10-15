// Only observation metadata from official App Server item lifecycle events.
// Never retain commands, arguments, outputs, errors, patches or reasoning.
export const actionLimits = { items: 100, itemBytes: 512, totalBytes: 64 * 1024 };
const types = new Set(['commandExecution', 'mcpToolCall', 'dynamicToolCall', 'fileChange']);
const statuses = new Set(['inProgress', 'completed', 'failed', 'declined']);
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const bounded = (value, limit) => {
  if (typeof value !== 'string') return null;
  let result = '';
  for (const char of value) {
    if (Buffer.byteLength(result + char) > limit) break;
    result += char;
  }
  return result;
};
const timestamp = value => Number.isSafeInteger(value) && value >= 0 && value <= 8640000000000000 ? new Date(value).toISOString() : null;

/** Update a bounded per-run journal; return false for irrelevant/duplicate/late events. */
export function recordAction(journal, method, params) {
  if (!['item/started', 'item/completed'].includes(method)) return false;
  const item = params?.item;
  if (!item || !types.has(item.type) || typeof item.id !== 'string' || !item.id || Buffer.byteLength(item.id) > 96) return false;
  const existing = journal.items.find(entry => entry.id === item.id);
  if (existing?.completed || (existing && existing.type !== item.type)) return false;
  if (!existing && journal.items.length >= actionLimits.items) {
    if (journal.truncated) return false;
    journal.truncated = true;
    return true;
  }
  const completed = method === 'item/completed';
  const entry = {
    id: item.id, type: item.type, status: statuses.has(item.status) ? item.status : null, completed,
    startedAt: existing?.startedAt ?? timestamp(params.startedAtMs),
    endedAt: completed ? timestamp(params.completedAtMs) : null,
    // Only commandExecution has an official item cwd. Tool cwd is unknown.
    cwd: item.type === 'commandExecution' && typeof item.cwd === 'string' && Buffer.byteLength(item.cwd) <= 128 ? item.cwd : null,
    exitCode: item.type === 'commandExecution' && Number.isInteger(item.exitCode) && item.exitCode >= -2147483648 && item.exitCode <= 2147483647 ? item.exitCode : null,
    durationMs: completed && Number.isSafeInteger(item.durationMs) && item.durationMs >= 0 ? item.durationMs : null,
    summary: ({ commandExecution: '命令执行', fileChange: '文件改动', mcpToolCall: 'MCP 工具调用', dynamicToolCall: '动态工具调用' })[item.type],
  };
  // Names are metadata; arguments/results are deliberately never accessed.
  if (['mcpToolCall', 'dynamicToolCall'].includes(item.type)) entry.tool = bounded(item.tool, 64);
  if (item.truncated === true || (typeof item.cwd === 'string' && Buffer.byteLength(item.cwd) > 128) || (typeof item.tool === 'string' && item.tool !== entry.tool)) entry.truncated = true;
  if (existing && !entry.cwd) entry.cwd = existing.cwd;
  if (JSON.stringify(existing) === JSON.stringify(entry)) return false;
  if (bytes(entry) > actionLimits.itemBytes) {
    entry.cwd = null;
    if (entry.tool) entry.tool = null;
    entry.truncated = true;
  }
  const next = [...journal.items];
  if (existing) next[next.indexOf(existing)] = entry; else next.push(entry);
  if (bytes(entry) > actionLimits.itemBytes || bytes({ items: next, truncated: journal.truncated }) > actionLimits.totalBytes) {
    if (journal.truncated) return false;
    journal.truncated = true; return true;
  }
  journal.items = next;
  return true;
}
