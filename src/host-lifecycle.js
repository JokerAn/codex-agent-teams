import { createServer, createConnection } from 'node:net';
import { chmodSync, mkdtempSync, writeFileSync, renameSync, unlinkSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export async function lifecycleRequest(endpoint, request, timeoutMs = 2400) {
  return new Promise((resolve, reject) => {
    const socket = createConnection(endpoint.socket);
    let data = '';
    const fail = error => { socket.destroy(); reject(error); };
    socket.setTimeout(timeoutMs, () => fail(new Error('Host lifecycle request timed out; cancellation may still be running.')));
    socket.on('error', fail);
    socket.on('connect', () => socket.write(JSON.stringify({ ...request, token: endpoint.token }) + '\n'));
    socket.on('data', chunk => {
      data += chunk;
      if (data.length > 16384) return fail(new Error('Host lifecycle reply exceeded limit'));
      if (!data.includes('\n')) return;
      try {
        const result = JSON.parse(data.slice(0, data.indexOf('\n')));
        socket.destroy(); result.error ? reject(new Error(result.error)) : resolve(result);
      } catch (error) { fail(error); }
    });
    socket.on('end', () => { if (!data.includes('\n')) fail(new Error('Host lifecycle connection closed without receipt')); });
  });
}

// One controller per MCP connection; only this runtime writes task state.
export async function startHostLifecycle(route) {
  const directory = mkdtempSync(join(tmpdir(), 'teams-host-'));
  chmodSync(directory, 0o700);
  const endpoint = { socket: join(directory, 'control.sock'), token: randomUUID() };
  const bindings = new Map(), pending = new Map(), stopped = new Set(), published = new Set(), sockets = new Set();
  let closed = false, closing;
  const turnKey = host => JSON.stringify([host.sessionId, host.turnId]);
  const key = (workspace, taskId) => JSON.stringify([workspace, taskId]);
  const text = value => typeof value === 'string' && value.length > 0 && value.length <= 256;
  const ownsEndpoint = path => {
    try { const value = JSON.parse(readFileSync(path, 'utf8')); return value.token === endpoint.token && value.socket === endpoint.socket; }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  };
  const controller = {
    publish(scope) {
      if (closed) throw new Error('Host lifecycle is closed');
      const runtime = scope.peekRuntime?.();
      if (!runtime) return;
      const path = join(runtime.config.workspace, '.codex-teams', 'host-control.json');
      if (published.has(path) && ownsEndpoint(path)) return;
      const temporary = `${path}.${randomUUID()}`;
      writeFileSync(temporary, JSON.stringify(endpoint) + '\n', { mode: 0o600, flag: 'wx' });
      renameSync(temporary, path); published.add(path);
    },
    claim(scope, taskId, ticket) {
      const runtime = scope.getRuntime();
      const id = key(runtime.config.workspace, taskId);
      const binding = pending.get(id) ?? bindings.get(id);
      if (!binding || binding.runtime !== runtime) throw new Error('Host lifecycle binding missing. Enable and trust the plugin PreToolUse/Interrupt hooks before starting or integrating members.');
      if (!ticket || binding.ticket !== ticket || binding.claimed) throw new Error('Missing, stale or already used host lifecycle ticket');
      controller.check(binding);
      binding.claimed = true;
      return binding;
    },
    started(binding, attemptId) {
      controller.check(binding);
      binding.attemptId = attemptId;
      const id = key(binding.runtime.config.workspace, binding.taskId);
      bindings.set(id, binding);
      pending.delete(id);
    },
    check(binding) {
      if (closed || stopped.has(turnKey(binding.host)) || stopped.has(JSON.stringify([binding.host.sessionId]))) throw new Error('Host turn was interrupted; refusing late member start or integration.');
      const id = key(binding.runtime.config.workspace, binding.taskId);
      if ((pending.get(id) ?? bindings.get(id)) !== binding) throw new Error('Host binding changed while dispatch was pending.');
    },
    async handle(request) {
      if (closed || request.token !== endpoint.token) throw new Error('Invalid host lifecycle capability');
      if (!text(request.sessionId)) throw new Error('Missing host session id');
      if (request.event === 'bind') {
        if (!text(request.turnId) || !text(request.taskId)) throw new Error('Missing host turn/task id');
        const scope = route({ workspace: request.workspace, taskId: request.taskId });
        const runtime = scope.getRuntime(), task = runtime.status(request.taskId);
        const id = key(runtime.config.workspace, task.id), old = bindings.get(id) ?? pending.get(id);
        if (old && (old.host.sessionId !== request.sessionId || old.host.turnId !== request.turnId) && runtime.active.has(task.id)) throw new Error('Task belongs to another active host turn');
        const binding = { runtime, taskId: task.id, attemptId: task.attempts.at(-1)?.id,
          host: { sessionId: request.sessionId, turnId: request.turnId }, ticket: randomUUID(), claimed: false };
        if (stopped.has(turnKey(binding.host)) || stopped.has(JSON.stringify([request.sessionId]))) throw new Error('Host turn was interrupted; refusing binding');
        // A ticket reserves a dispatch; it must not replace an accepted attempt
        // until start/integrate has succeeded. Rejected requests keep its owner.
        pending.set(id, binding);
        return { bound: true, ticket: binding.ticket };
      }
      if (!['Interrupt', 'SessionEnd'].includes(request.event)) throw new Error('Unknown host lifecycle event');
      if (request.event === 'Interrupt' && !text(request.turnId)) throw new Error('Missing interrupted turn id');
      // Tombstone BEFORE awaiting cancellation, including pending model discovery.
      if (stopped.size >= 10000) { closed = true; throw new Error('Host event limit reached; close this MCP connection before dispatching again'); }
      stopped.add(request.event === 'Interrupt' ? turnKey(request) : JSON.stringify([request.sessionId]));
      const selected = [...bindings.values()].filter(binding => binding.host.sessionId === request.sessionId &&
        (request.event === 'SessionEnd' || binding.host.turnId === request.turnId));
      const results = await Promise.all(selected.map(async binding => {
        // A late event must not act on a newer retry or an unrelated active entry.
        const current = binding.runtime.status(binding.taskId);
        if (current.attempts.at(-1)?.id !== binding.attemptId) return { taskId: current.id, status: current.status, exitConfirmed: false, stale: true };
        const task = await binding.runtime.cancel(binding.taskId);
        const attempt = task.attempts.at(-1);
        let exitConfirmed = !attempt || attempt.cleanupConfirmed === true;
        if (attempt?.workspaceId) {
          try { binding.runtime.assertVerificationExited(binding.runtime.workspaceStatus(attempt.workspaceId)); }
          catch { exitConfirmed = false; }
        }
        return { taskId: task.id, status: task.status, exitConfirmed: exitConfirmed && !binding.runtime.active.has(task.id) };
      }));
      return { cancelled: results, exitConfirmed: results.every(result => result.exitConfirmed) };
    },
    close() {
      return closing ??= (async () => {
        closed = true;
        for (const socket of sockets) socket.destroy();
        await new Promise(resolve => server.close(resolve));
        for (const path of published) { try { if (ownsEndpoint(path)) unlinkSync(path); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
        rmSync(directory, { recursive: true, force: true });
      })();
    },
  };
  const server = createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
    socket.setTimeout(3000, () => socket.destroy());
    let data = '', handled = false;
    socket.on('data', chunk => {
      if (handled) return;
      data += chunk;
      if (data.length > 16384) { socket.destroy(); return; }
      if (!data.includes('\n')) return;
      handled = true;
      Promise.resolve().then(() => controller.handle(JSON.parse(data.slice(0, data.indexOf('\n')))))
        .then(result => socket.end(JSON.stringify(result) + '\n'), error => socket.end(JSON.stringify({ error: error.message }) + '\n'));
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(endpoint.socket, resolve); });
  chmodSync(endpoint.socket, 0o600);
  return controller;
}
