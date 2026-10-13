import { DatabaseSync } from 'node:sqlite';
import { existsSync, lstatSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export function processAlive(pid, group = false) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(group ? -pid : pid, 0); return true; }
  catch (error) { return error.code !== 'ESRCH'; }
}

/** One runtime owns a workspace DB. No silent replay after a crash. */
export class TaskStore {
  constructor(path, identity = {}) {
    mkdirSync(dirname(path), { recursive: true });
    if (lstatSync(dirname(path)).isSymbolicLink() || (existsSync(path) && lstatSync(path).isSymbolicLink())) throw new Error('State directory and database must not be symlinks');
    this.db = new DatabaseSync(path);
    this.owner = randomUUID();
    this.db.exec(`PRAGMA busy_timeout=3000;
      PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT, at TEXT NOT NULL, kind TEXT NOT NULL);
    `);
    try {
      this.transaction(() => {
        const version = this.db.prepare('SELECT value FROM meta WHERE key=?').get('version');
        if (version && version.value !== '1') throw new Error('Unsupported state schema version');
        const old = this.db.prepare('SELECT value FROM meta WHERE key=?').get('owner');
        if (old && processAlive(JSON.parse(old.value).pid)) throw new Error('Another runtime owns this workspace. Use its MCP connection.');
        for (const task of this.list()) {
          const latest = task.attempts.at(-1);
          for (const launch of [latest, latest?.machineReview]) {
            if (launch?.memberLaunch && launch.memberLaunch !== 'exited' && !Number.isSafeInteger(launch.childPid)) throw new Error(`Task ${task.id} has an unknown member/reviewer launch identity; inspect processes before recovery. No automatic replay.`);
          }
          if (latest?.cleanupConfirmed === false) {
            if (processAlive(latest.childPid, true) || processAlive(latest.machineReview?.childPid, true)) throw new Error(`Task ${task.id} may still have a live child/reviewer; confirm exit before recovery`);
            latest.cleanupConfirmed = true; this.save(task, 'member-exit-recovered', false);
          }
          if (!['running', 'integrating'].includes(task.status)) continue;
          const attempt = task.attempts.at(-1);
          if (processAlive(attempt?.childPid, true) || processAlive(attempt?.machineReview?.childPid, true)) {
            throw new Error(`Task ${task.id} may still have a live child (PID ${attempt.childPid}); confirm its exit before recovery.`);
          }
          task.status = task.status === 'integrating' ? 'integration_failed' : 'interrupted';
          if (task.status === 'integration_failed' && attempt?.integration) { attempt.integration.status = 'recovery_required'; attempt.integration.error = 'Integration interrupted; inspect source changes and logs. Never automatically reapply.'; }
          task.error = 'Previous runtime exited; no automatic replay. Retry explicitly after checking prior work.';
          if (attempt) {
            // Recovery observes a stopped execution; it cannot know when it
            // stopped, and must not overwrite an already recorded member end.
            attempt.status = task.status;
            attempt.recoveryObservedAt = new Date().toISOString();
            attempt.phase = task.status;
            const phases = attempt.phases ??= [];
            if (phases.length && !phases.at(-1).endedAt) phases.at(-1).interrupted = true;
            phases.push({ phase: task.status, observedAt: attempt.recoveryObservedAt });
            if (task.status === 'integration_failed' && attempt.integration) attempt.integration.recoveryObservedAt = attempt.recoveryObservedAt;
          }
          this.save(task, 'recovered-interruption', false);
        }
        for (const workspace of this.listWorkspaces()) {
          let recovered = false;
          for (const check of workspace.verifications ?? []) {
            if (check.status !== 'running' && check.cleanupConfirmed !== false) continue;
            if (processAlive(check.childPid, true)) throw new Error(`Verification ${check.id} may have a live process group (${check.childPid}); confirm exit before recovery.`);
            if (check.status === 'running') { check.status = 'interrupted'; check.error = 'Previous runtime exited; verification was not completed. No automatic replay.'; check.recoveryObservedAt = new Date().toISOString(); }
            // A launch was attempted but its pid never reached disk: the process group may be alive, so
            // fail closed exactly like an attempt with an unknown member launch identity. Permanently
            // refusing every operation with no way out was the bug; silently assuming safety is worse.
            if (check.launchAttempted && !Number.isSafeInteger(check.childPid)) {
              throw new Error(`Verification ${check.id} has an unknown launch identity; inspect processes for this workspace before recovery. No automatic replay.`);
            }
            check.cleanupConfirmed = !processAlive(check.childPid, true);
            recovered = true;
          }
          if (recovered) this.saveWorkspace(workspace, 'verification-recovered', false);
          if (!['preparing', 'removing'].includes(workspace.status)) continue;
          workspace.status = 'recovery_required';
          workspace.error = 'Previous runtime interrupted workspace preparation/removal; inspect artifacts before cleanup. No automatic replay.';
          this.saveWorkspace(workspace, 'workspace-recovery-required', false);
        }
        this.db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run('version', '1');
        this.db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run('owner', JSON.stringify({ pid: process.pid, token: this.owner, version: identity.version ?? null, sourceRoot: identity.sourceRoot ?? null }));
      });
    } catch (error) { this.db.close(); throw error; }
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  assertOwner() {
    const row = this.db.prepare('SELECT value FROM meta WHERE key=?').get('owner');
    if (!row || JSON.parse(row.value).token !== this.owner) throw new Error('Runtime no longer owns state');
  }
  modelPreference() {
    const row = this.db.prepare('SELECT value FROM meta WHERE key=?').get('modelPreference');
    return row ? JSON.parse(row.value) : null;
  }
  saveModelPreference(value) {
    this.transaction(() => {
      this.assertOwner();
      if (value) this.db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run('modelPreference', JSON.stringify(value));
      else this.db.prepare('DELETE FROM meta WHERE key=?').run('modelPreference');
    });
  }
  get(id) {
    const row = this.db.prepare('SELECT data FROM tasks WHERE id=?').get(id);
    if (!row) throw new Error(`Unknown task: ${id}`);
    return JSON.parse(row.data);
  }
  list() { return this.db.prepare('SELECT data FROM tasks ORDER BY rowid').all().map(row => JSON.parse(row.data)); }
  save(task, event, atomic = true) {
    const write = () => {
      if (atomic) this.assertOwner();
      task.updatedAt = new Date().toISOString();
      this.db.prepare('INSERT OR REPLACE INTO tasks VALUES (?,?)').run(task.id, JSON.stringify(task));
      this.db.prepare('INSERT INTO events(task_id,at,kind) VALUES (?,?,?)').run(task.id, task.updatedAt, event);
    };
    if (atomic) this.transaction(write); else write();
    return task;
  }
  getWorkspace(id) {
    const row = this.db.prepare('SELECT data FROM workspaces WHERE id=?').get(id);
    if (!row) throw new Error(`Unknown workspace: ${id}`);
    return JSON.parse(row.data);
  }
  listWorkspaces() { return this.db.prepare('SELECT data FROM workspaces ORDER BY rowid').all().map(row => JSON.parse(row.data)); }
  saveWorkspace(workspace, event, atomic = true) {
    const write = () => {
      if (atomic) this.assertOwner();
      workspace.updatedAt = new Date().toISOString();
      this.db.prepare('INSERT OR REPLACE INTO workspaces VALUES (?,?)').run(workspace.id, JSON.stringify(workspace));
      this.db.prepare('INSERT INTO events(task_id,at,kind) VALUES (?,?,?)').run(`workspace:${workspace.id}`, workspace.updatedAt, event);
    };
    if (atomic) this.transaction(write); else write();
    return workspace;
  }
  saveBinding(task, workspace, event) {
    return this.transaction(() => {
      this.assertOwner();
      this.save(task, event, false);
      return this.saveWorkspace(workspace, event, false);
    });
  }
  close() {
    if (this.closed) return;
    this.transaction(() => {
      this.assertOwner();
      this.db.prepare('DELETE FROM meta WHERE key=?').run('owner');
    });
    this.db.close();
    this.closed = true;
  }
}
