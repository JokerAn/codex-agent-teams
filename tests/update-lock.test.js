import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { acquireUpdateLock } from '../scripts/update-lock.js';

function home(t) {
  const root = mkdtempSync(join(tmpdir(), 'teams-update-lock-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test('canonical home aliases share one lock, which can be reacquired after release', t => {
  const root = home(t), path = join(root, 'home'), alias = join(root, 'alias');
  mkdirSync(path); symlinkSync(path, alias, 'dir');
  const first = acquireUpdateLock(path);
  assert.throws(() => acquireUpdateLock(alias), /更新锁.*另一个更新进程/);
  first.release();
  const second = acquireUpdateLock(alias);
  second.assertOwned(); second.release();
  assert.equal(existsSync(first.path), false);
});

test('releasing a replaced lock preserves the other owner record', t => {
  const lock = acquireUpdateLock(home(t));
  const replacement = { pid: process.pid, token: 'new-owner-token' };
  writeFileSync(lock.path, JSON.stringify(replacement));
  assert.throws(() => lock.release(), /所有权已变化/);
  assert.deepEqual(JSON.parse(readFileSync(lock.path, 'utf8')), replacement);
});

test('linked and partial locks are refused without following or deleting them', t => {
  const root = home(t), path = join(root, '.codex-agent-teams-update.lock'), target = join(root, 'owner-data');
  writeFileSync(target, 'keep me'); symlinkSync(target, path);
  assert.throws(() => acquireUpdateLock(root), /更新锁已存在.*身份无法确认/);
  assert.equal(readFileSync(target, 'utf8'), 'keep me');
  rmSync(path); writeFileSync(path, '');
  assert.throws(() => acquireUpdateLock(root), /更新锁已存在.*身份无法确认/);
  assert.equal(readFileSync(path, 'utf8'), '');
});

test('a dead updater lock is retained until its CLI child exit can be checked manually', t => {
  const root = home(t);
  const script = `import {acquireUpdateLock} from ${JSON.stringify(new URL('../scripts/update-lock.js', import.meta.url).href)};acquireUpdateLock(process.argv[1]);`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script, root], { encoding: 'utf8', timeout: 10000 });
  assert.equal(child.status, 0, child.stderr);
  const path = join(root, '.codex-agent-teams-update.lock'), original = readFileSync(path, 'utf8');
  assert.throws(() => acquireUpdateLock(root), /原更新进程.*已退出.*CLI 子进程退出情况仍需确认/);
  assert.equal(readFileSync(path, 'utf8'), original);
});
