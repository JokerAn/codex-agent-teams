import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export function processAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code !== 'ESRCH'; }
}

/** One runtime owns a workspace DB. No silent replay after a crash. */
export class TaskStore {
  constructor(path) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.owner = randomUUID();
    this.db.exec(`PRAGMA busy_timeout=3000;
      PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT, at TEXT NOT NULL, kind TEXT NOT NULL);
    `);
    try {
      this.transaction(() => {
        const version = this.db.prepare('SELECT value FROM meta WHERE key=?').get('version');
        if (version && version.value !== '1') throw new Error('Unsupported state schema version');
        const old = this.db.prepare('SELECT value FROM meta WHERE key=?').get('owner');
        if (old && processAlive(JSON.parse(old.value).pid)) throw new Error('Another runtime owns this workspace. Use its MCP connection.');
        for (const task of this.list()) {
          if (task.status !== 'running') continue;
          const attempt = task.attempts.at(-1);
          if (processAlive(attempt?.childPid)) {
            throw new Error(`Task ${task.id} may still have a live child (PID ${attempt.childPid}); confirm its exit before recovery.`);
          }
          task.status = 'interrupted';
          task.error = 'Previous runtime exited; no automatic replay. Retry explicitly after checking prior work.';
          if (attempt) { attempt.status = 'interrupted'; attempt.endedAt = new Date().toISOString(); }
          this.save(task, 'recovered-interruption', false);
        }
        this.db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run('version', '1');
        this.db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run('owner', JSON.stringify({ pid: process.pid, token: this.owner }));
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
