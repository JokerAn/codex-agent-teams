import { isAbsolute, join } from 'node:path';
import { CodexBackend } from './app-server.js';
import { TaskRuntime } from './runtime.js';
import { TaskStore } from './store.js';
import { pluginIdentity, readSnapshot } from './status.js';
import { assertWorkspace, workspaceIdentity } from './workspace.js';

/** Machine-local plugin scopes are selected explicitly, never from cache cwd. */
export class WorkspaceRouter {
  constructor(config, { createRuntime, discoverModels, observe = readSnapshot } = {}) {
    this.config = structuredClone(config);
    this.scopes = new Map();
    this.closing = false;
    this.createRuntime = createRuntime ?? (scopeConfig => {
      const backend = new CodexBackend({ binary: scopeConfig.codexBin });
      const store = new TaskStore(join(scopeConfig.workspace, '.codex-teams', 'state.sqlite'), pluginIdentity());
      try { return new TaskRuntime(store, backend, scopeConfig, { requireModelConfirmation: true }); }
      catch (error) { store.close(); throw error; }
    });
    this.discoverModels = discoverModels ?? (workspace => new CodexBackend({ binary: this.config.codexBin }).probe(workspace, { modelSettings: true }));
    this.observe = observe;
    this.fixed = config.workspace ? workspaceIdentity(config.workspace) : null;
  }

  assertOpen() {
    if (this.closing) throw new Error('Workspace router is closing');
  }

  scopeFor(workspace) {
    this.assertOpen();
    if (typeof workspace !== 'string' || !isAbsolute(workspace)) throw new Error('Provide an absolute workspace from the current chat cwd; plugin cache cwd is not a target.');
    const target = workspaceIdentity(workspace);
    if (this.fixed) {
      if (this.fixed.root !== target.root) throw new Error(`Target workspace mismatch: expected ${this.fixed.root}; requested ${target.root}`);
      assertWorkspace(this.fixed, target);
    }
    const existing = this.scopes.get(target.root);
    if (existing) { existing.check(); return existing; }
    const check = () => {
      this.assertOpen();
      assertWorkspace(target, workspaceIdentity(target.root));
    };
    const record = { runtime: null, check, scope: null };
    record.scope = Object.freeze({
      workspace: target.root,
      peekRuntime: () => { check(); return record.runtime; },
      getRuntime: () => {
        check();
        return record.runtime ??= this.createRuntime({ ...structuredClone(this.config), workspace: target.root });
      },
      observe: taskId => { check(); return this.observe(target.root, taskId); },
      discoverModels: async () => {
        check();
        const catalog = await this.discoverModels(target.root);
        check();
        return { ...catalog, workspace: target.root };
      },
    });
    this.scopes.set(target.root, record);
    return record;
  }

  resolve({ workspace, taskId } = {}) {
    this.assertOpen();
    const explicit = workspace !== undefined;
    const selected = explicit ? this.scopeFor(workspace) : this.fixed ? this.scopeFor(this.fixed.root) : null;
    if (taskId !== undefined) {
      if (typeof taskId !== 'string' || !taskId) throw new Error('Provide a nonempty taskId');
      // An explicit valid project is sufficient; a replaced unrelated scope must
      // not block work on this project. Its own identity is always checked.
      if (selected?.scope.observe().tasks.some(task => task.id === taskId)) return selected.scope;
      // Re-read known projects only. No central index, stale id cache or filesystem scan.
      const matches = [...this.scopes.values()].filter(record => record.scope.observe().tasks.some(task => task.id === taskId));
      if (matches.length > 1) throw new Error(`Task ${taskId} is ambiguous; duplicate ids exist in known workspaces`);
      if (matches.length) {
        if (selected && selected !== matches[0]) throw new Error(`Task ${taskId} belongs to another workspace; use its actual workspace`);
        return matches[0].scope;
      }
      throw new Error(`Unknown task: ${taskId}; provide its explicit workspace after reconnecting`);
    }
    if (selected) return selected.scope;
    if (this.scopes.size === 1) {
      const record = this.scopes.values().next().value;
      record.check();
      return record.scope;
    }
    throw new Error(this.scopes.size ? 'Multiple workspaces are known; provide workspace or a known taskId. No last-used workspace is assumed.' : 'Provide an absolute workspace from the current chat cwd; plugin cache cwd is not a target.');
  }

  close() {
    if (this.closePromise) return this.closePromise;
    this.closing = true;
    return this.closePromise = (async () => {
      const results = await Promise.allSettled([...this.scopes.values()].filter(record => record.runtime).map(record => Promise.resolve().then(() => record.runtime.close())));
      const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
      if (errors.length) throw new AggregateError(errors, 'Failed to close workspace runtimes');
    })();
  }
}
