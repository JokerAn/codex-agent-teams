import { closeSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

/** All cooperating updaters share one effective-home lock, including rollback. */
export function acquireUpdateLock(codexHome) {
  mkdirSync(resolve(codexHome), { recursive: true });
  const home = realpathSync(resolve(codexHome));
  const path = join(home, '.codex-agent-teams-update.lock');
  const owner = { pid: process.pid, token: randomUUID(), createdAt: new Date().toISOString() };
  let fd, identity;
  try {
    fd = openSync(path, 'wx', 0o600);
    identity = fstatSync(fd);
    writeFileSync(fd, JSON.stringify(owner) + '\n');
    fsyncSync(fd);
  } catch (error) {
    if (fd !== undefined) { closeSync(fd); unlinkSync(path); }
    if (error.code !== 'EEXIST') throw error;
    let detail = '身份无法确认';
    try {
      if (!lstatSync(path).isFile()) throw new Error('not a regular lock');
      const existing = JSON.parse(readFileSync(path, 'utf8'));
      if (Number.isSafeInteger(existing.pid) && existing.pid > 0) {
        let running = true;
        try { process.kill(existing.pid, 0); } catch (failure) { running = failure.code !== 'ESRCH'; }
        detail = running ? `另一个更新进程 ${existing.pid} 尚未退出` : `原更新进程 ${existing.pid} 已退出，CLI 子进程退出情况仍需确认`;
      }
    } catch { /* A partial, replaced or linked lock is not safe to reclaim. */ }
    throw new Error(`更新锁已存在：${detail}。未读取或替换安装；确认原更新及其 CLI 子进程均已退出后，才可人工清理锁：${path}`, { cause: error });
  }
  closeSync(fd);
  const assertOwned = () => {
    let current, value;
    try {
      current = lstatSync(path);
      if (!current.isFile()) throw new Error('not a regular lock');
      value = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) { throw new Error(`更新锁所有权丢失，保留现场：${path}`, { cause: error }); }
    if (current.dev !== identity.dev || current.ino !== identity.ino || value.pid !== owner.pid || value.token !== owner.token) {
      throw new Error(`更新锁所有权已变化，保留现场：${path}`);
    }
  };
  return { home, path, assertOwned, release() { assertOwned(); unlinkSync(path); } };
}
