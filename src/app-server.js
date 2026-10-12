import packageInfo from '../package.json' with { type: 'json' };
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { outputSchemaFor } from './contracts.js';
import { realpathSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { processAlive } from './store.js';
import { signalGroup } from './verification.js';
import { MEMBER_INSTRUCTIONS, WRITE_INSTRUCTIONS, REVIEW_INSTRUCTIONS } from './policy.js';

/** App Server's line-delimited protocol (not MCP). One client owns one process group. */
export class AppServerClient extends EventEmitter {
  constructor({ binary = 'codex', args = ['app-server', '--stdio'], cwd = process.cwd(), requestTimeoutMs = 15000, env = {} } = {}) {
    super();
    if (process.platform === 'win32') throw new Error('P0 process cleanup is validated on macOS/Linux only');
    this.pending = new Map();
    this.nextId = 1;
    this.requestTimeoutMs = requestTimeoutMs;
    this.stderr = '';
    this.child = spawn(binary, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], detached: true, shell: false, env: { ...process.env, CODEX_TEAMS_MEMBER: '1', ...env } });
    this.closed = new Promise(resolve => { this.resolveClosed = resolve; });
    this.child.on('error', error => { this.fail(error); this.resolveClosed(); });
    this.child.on('close', (code, signal) => {
      this.exited = true;
      if (!this.stopping) this.fail(new Error(`App Server closed (${code ?? signal})`));
      this.resolveClosed();
    });
    this.child.stdin.on('error', error => { if (!this.stopping) this.fail(error); });
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', chunk => { this.stderr = (this.stderr + chunk).slice(-8000); });
    this.frameBuffer = '';
    this.frameBufferBytes = 0;
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', chunk => {
      // Keep draining the pipe after failure, but never retain or parse more output.
      if (this.failure || this.stopping) return;
      let offset = 0;
      while (!this.failure && !this.stopping && offset < chunk.length) {
        const end = chunk.indexOf('\n', offset);
        const fragment = chunk.slice(offset, end === -1 ? chunk.length : end);
        const bytes = Buffer.byteLength(fragment);
        if (this.frameBufferBytes + bytes > 16 * 1024 * 1024) { this.fail(new Error('App Server frame exceeds 16 MiB')); return; }
        this.frameBuffer += fragment;
        this.frameBufferBytes += bytes;
        if (end === -1) return;
        const line = this.frameBuffer.trim();
        this.frameBuffer = ''; this.frameBufferBytes = 0;
        if (line) {
          try { this.receive(JSON.parse(line)); }
          catch { this.fail(new Error('Invalid App Server protocol frame')); }
        }
        offset = end + 1;
      }
    });
  }
  fail(error) {
    if (this.failure) return;
    this.failure = error;
    this.frameBuffer = '';
    this.frameBufferBytes = 0;
    for (const pending of [...this.pending.values()]) pending.reject(error);
    this.emit('fatal', error);
  }
  send(frame) {
    if (this.failure) throw this.failure;
    if (this.stopping || this.exited || !this.child.stdin.writable) throw new Error('App Server is closed');
    this.child.stdin.write(JSON.stringify(frame) + '\n');
  }
  receive(frame) {
    if (frame.method && frame.id !== undefined) {
      // P0 has no interactive approval/input bridge. Never approve on the user's behalf.
      if (['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'].includes(frame.method)) {
        this.send({ id: frame.id, result: { decision: 'cancel' } });
      } else {
        this.send({ id: frame.id, error: { code: -32601, message: 'Interactive requests are unsupported by this runtime' } });
      }
      this.fail(new Error(`Member needs interaction: ${frame.method}`));
    } else if (frame.id !== undefined) {
      const pending = this.pending.get(frame.id);
      if (pending) frame.error ? pending.reject(new Error(`${pending.method}: ${frame.error.message}`)) : pending.resolve(frame.result);
    } else if (frame.method) this.emit('notification', frame.method, frame.params ?? {});
  }
  request(method, params = {}, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(signal.reason); return; }
      const id = this.nextId++;
      let timer;
      const settle = (fn, value) => {
        clearTimeout(timer); this.pending.delete(id); signal?.removeEventListener('abort', abort); fn(value);
      };
      const abort = () => settle(reject, signal.reason ?? new Error('Cancelled'));
      this.pending.set(id, { method, resolve: value => settle(resolve, value), reject: error => settle(reject, error) });
      timer = setTimeout(() => settle(reject, new Error(`Protocol request timed out: ${method}`)), this.requestTimeoutMs);
      signal?.addEventListener('abort', abort, { once: true });
      try { this.send({ id, method, params }); } catch (error) { settle(reject, error); }
    });
  }
  async initialize(signal, { experimentalApi = false } = {}) {
    const info = await this.request('initialize', { clientInfo: { name: 'codex_agent_teams', version: packageInfo.version }, ...(experimentalApi ? { capabilities: { experimentalApi: true } } : {}) }, signal);
    this.send({ method: 'initialized', params: {} });
    return info;
  }
  async stop() {
    if (this.stopPromise) return this.stopPromise;
    this.stopPromise = (async () => {
      this.stopping = true;
      this.frameBuffer = '';
      this.frameBufferBytes = 0;
      for (const p of [...this.pending.values()]) p.reject(new Error('App Server stopped'));
      const pid = this.child.pid;
      if (pid && processAlive(pid, true)) signalGroup(pid, 'SIGTERM');
      await Promise.race([this.closed, delay(300)]);
      if (pid && processAlive(pid, true)) signalGroup(pid, 'SIGKILL');
      const until = Date.now() + 2000;
      while (!this.exited && pid && Date.now() < until) await delay(25);
      while (pid && processAlive(pid, true) && Date.now() < until) await delay(25);
      if (pid && (!this.exited || processAlive(pid, true))) throw new Error(`App Server process group ${pid} exit is unconfirmed`);
    })();
    return this.stopPromise;
  }
}


/** App Server splits config override keys on dots; TOML quotes are NOT supported here. */
export function memberOverrides(config) {
  const overrides = {
    'features.multi_agent': false, 'features.plugins': false, 'features.apps': false,
    'features.hooks': false, 'features.memories': false, web_search: 'disabled',
  };
  for (const name of Object.keys(config.mcp_servers ?? {})) {
    if (!/^[A-Za-z0-9_-]+$/.test(name)) throw new Error(`Cannot safely disable inherited MCP key: ${name}`);
    overrides[`mcp_servers.${name}.enabled`] = false;
  }
  return overrides;
}

async function startMemberThread(client, cwd, selection, signal, { mode = 'read-only', role = 'member' } = {}) {
  const { config } = await client.request('config/read', { includeLayers: false }, signal);
  const started = await client.request('thread/start', {
    cwd, model: selection.model, sandbox: mode, approvalPolicy: 'never',
    developerInstructions: role === 'review' ? REVIEW_INSTRUCTIONS : mode === 'workspace-write' ? WRITE_INSTRUCTIONS : MEMBER_INSTRUCTIONS,
    config: { ...memberOverrides(config), ...(mode === 'workspace-write' ? {
      'sandbox_workspace_write.writable_roots': [], 'sandbox_workspace_write.network_access': false,
      'sandbox_workspace_write.exclude_tmpdir_env_var': true, 'sandbox_workspace_write.exclude_slash_tmp': true,
    } : {}) }, ephemeral: true,
  }, signal);
  if (started.model !== selection.model) throw new Error(`Model changed unexpectedly: ${started.model}`);
  let sameDirectory = false;
  try { sameDirectory = typeof started.cwd === 'string' && realpathSync(started.cwd) === realpathSync(cwd); }
  catch { /* Missing or inaccessible paths must fail before inference. */ }
  if (!sameDirectory) throw new Error('Host did not confirm the requested working directory; refusing to start inference.');
  const safe = mode === 'workspace-write'
    ? started.sandbox?.type === 'workspaceWrite' && started.sandbox.writableRoots?.length === 0 && started.sandbox.excludeSlashTmp === true && started.sandbox.excludeTmpdirEnvVar === true
    : started.sandbox?.type === 'readOnly';
  if (!safe || started.sandbox.networkAccess !== false || started.approvalPolicy !== 'never') {
    throw new Error(`Host did not confirm ${mode} permissions; refusing to start inference.`);
  }
  return started;
}

export class CodexBackend {
  constructor(options = {}) { this.options = options; }
  async probe(cwd = process.cwd(), { checkThread = false, profiles, plugin } = {}) {
    const client = new AppServerClient({ ...this.options, cwd });
    try {
      const server = await client.initialize(undefined, { experimentalApi: Boolean(plugin) });
      const models = [];
      let cursor;
      do {
        const page = await client.request('model/list', { ...(cursor ? { cursor } : {}), limit: 100 });
        models.push(...page.data.map(m => ({ model: m.model, default: m.isDefault, efforts: m.supportedReasoningEfforts.map(e => e.reasoningEffort) })));
        cursor = page.nextCursor;
      } while (cursor);
      const profileChecks = [];
      for (const [name, profile] of Object.entries(profiles ?? {})) {
        const model = models.find(candidate => candidate.model === profile.model);
        if (!model) throw new Error(`Configured ${name} model is unavailable: ${profile.model}`);
        if (profile.effort && !model.efforts.includes(profile.effort)) throw new Error(`Configured ${name} effort is unsupported: ${profile.effort} (${profile.model})`);
        profileChecks.push({ profile: name, model: profile.model, effort: profile.effort ?? null, available: true });
      }
      let pluginCheck;
      if (plugin) {
        const { plugin: detail } = await client.request('plugin/read', { marketplacePath: plugin.marketplacePath, pluginName: plugin.pluginName });
        if (detail?.summary?.name !== plugin.pluginName || !detail.skills?.some(skill => ['team', `${plugin.pluginName}:team`].includes(skill.name)) || !detail.mcpServers?.includes('codex-agent-teams')) {
          throw new Error(`Host did not discover the prepared team skill and MCP server (skills: ${detail?.skills?.map(skill => skill.name).join(', ') ?? 'none'}; MCP: ${detail?.mcpServers?.join(', ') ?? 'none'})`);
        }
        pluginCheck = { name: detail.summary.name, marketplace: detail.marketplaceName, skills: detail.skills.map(skill => skill.name), mcpServers: detail.mcpServers, installed: detail.summary.installed, enabled: detail.summary.enabled, mcpConnectionChecked: false };
      }
      let threadCheck;
      if (checkThread) {
        const model = profiles?.expert?.model ?? models.find(m => m.default)?.model;
        if (!model) throw new Error('No default model is available for thread check');
        const started = await startMemberThread(client, cwd, { model });
        threadCheck = { created: Boolean(started.thread.id), model: started.model, sandbox: started.sandbox, approvalPolicy: started.approvalPolicy };
      }
      return { server, models, ...(profiles ? { profileChecks } : {}), ...(pluginCheck ? { pluginCheck } : {}), ...(threadCheck ? { threadCheck } : {}), inferenceStarted: false };
    } finally { await client.stop(); }
  }
  async run({ cwd, selection, acceptance, prompt, signal, mode = 'read-only', role = 'member', onProgress = () => {} }) {
    onProgress({ memberLaunch: 'starting' });
    const client = new AppServerClient({ ...this.options, cwd });
    let threadId, turnId, usage = null, finalTurn, fatal, wake;
    const messages = new Map();
    const completions = new Map();
    const notifyWaiter = () => { if (wake) wake(); };
    const abort = () => { fatal = signal.reason ?? new Error('Cancelled'); notifyWaiter(); };
    client.on('fatal', error => { fatal = error; notifyWaiter(); });
    client.on('notification', (method, params) => {
      if (params.threadId !== threadId) return;
      if (method === 'item/completed' && params.item?.type === 'agentMessage') {
        if (params.item.phase !== 'commentary') messages.set(params.turnId, params.item.text);
      }
      if (method === 'thread/tokenUsage/updated') {
        usage = params.tokenUsage;
        onProgress({ usage });
      }
      if (method === 'turn/completed') { completions.set(params.turn.id, params.turn); notifyWaiter(); }
    });
    signal.addEventListener('abort', abort, { once: true });
    try {
      if (signal.aborted) throw signal.reason;
      onProgress({ childPid: client.child.pid, memberLaunch: 'active' });
      await client.initialize(signal);
      const started = await startMemberThread(client, cwd, selection, signal, { mode, role });
      threadId = started.thread.id;
      onProgress({ threadId, actualModel: started.model ?? null });
      const turn = await client.request('turn/start', {
        threadId, input: [{ type: 'text', text: prompt }],
        ...(selection.effort ? { effort: selection.effort } : {}), outputSchema: outputSchemaFor(acceptance),
      }, signal);
      turnId = turn.turn.id;
      onProgress({ turnId });
      while (!fatal && !(finalTurn = completions.get(turnId))) {
        await new Promise(resolve => { wake = resolve; });
        wake = undefined;
      }
      if (fatal) throw fatal;
      if (finalTurn.status !== 'completed') throw new Error(`Turn ${finalTurn.status}: ${finalTurn.error?.message ?? 'no successful result'}`);
      const finalMessage = [...(finalTurn.items ?? [])].reverse().find(item => item.type === 'agentMessage' && item.phase !== 'commentary');
      const text = finalMessage?.text ?? messages.get(turnId);
      if (!text) throw new Error('Completed turn has no final structured result');
      return { result: JSON.parse(text), usage, threadId, turnId, actualModel: started.model ?? null };
    } finally {
      signal.removeEventListener('abort', abort);
      if (signal.aborted && threadId && turnId && !client.failure) {
        // Bounded graceful interrupt; process-group shutdown remains authoritative.
        client.requestTimeoutMs = 1000;
        await client.request('turn/interrupt', { threadId, turnId }).catch(() => {});
      }
      await client.stop();
      onProgress({ memberLaunch: 'exited' });
    }
  }
}
