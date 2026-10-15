import { overview as statusOverview, observedTaskView, taskView, toolFeedback } from './status.js';
import packageInfo from '../package.json' with { type: 'json' };
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { isAbsolute } from 'node:path';
import { taskSchema, reviewSchema, modelRolesSchema } from './contracts.js';
import { modelSelectionForm, acceptedModelRoles, validateModelSelection } from './models.js';
import { workspaceIdentity } from './workspace.js';
import { startStatusPanel } from './status-panel.js';
import { TaskObserver } from './observation.js';
import { startHostLifecycle } from './host-lifecycle.js';

export function createMcpServer(runtime, { observe, discoverModels, route, lifecycle } = {}) {
  let knownRuntime = typeof runtime === 'function' ? undefined : runtime;
  const getRuntime = () => knownRuntime ??= runtime();
  const legacyScope = { getRuntime, peekRuntime: () => knownRuntime, observe, discoverModels };
  const server = new McpServer({ name: 'codex-agent-teams', version: packageInfo.version });
  const observer = new TaskObserver();
  const panels = new Map();
  let panelsClosing = false;
  const closePanels = async () => {
    panelsClosing = true;
    await Promise.all([...panels.values()].map(pending => pending.then(panel => panel.close(), () => {})));
  };
  const sdkClose = server.close.bind(server);
  server.close = async () => { try { await closePanels(); } finally { await sdkClose(); } };
  server.server.onclose = () => { void closePanels().catch(error => console.error(error.message)); };
  const id = z.string().min(1);
  const workspacePath = z.string().min(1).refine(isAbsolute, 'workspace must be an absolute project path');
  const workspace = workspacePath.optional();
  const dispatchWorkspace = lifecycle && route ? workspacePath : workspace;
  const afterCursor = z.string().min(1).max(2048).optional();
  const routingGuidance = ' The captain supplies workspace from the current chat cwd automatically; do not ask the user to type paths. A taskId known in this connection can omit workspace. After reconnecting, supply workspace from the current context to find saved tasks. If multiple projects are known, calls without a taskId need workspace.';
  const tool = (name, description, schema, handler, readOnly = false, destructive = false) => {
    server.registerTool(name, {
      description: description + (lifecycle && route && ['teams_start', 'teams_integrate'].includes(name)
        ? ' REQUIRED workspace is the absolute task target.root, supplied by the captain; never substitute chat cwd for another project. Do not ask the user to type known paths. After reconnecting, initialize the saved task with teams_wait before dispatch.'
        : routingGuidance), inputSchema: schema,
      annotations: { readOnlyHint: readOnly, destructiveHint: destructive, openWorldHint: !readOnly },
    }, async (args, ctx) => {
      try {
        if (!route && args.workspace !== undefined) throw new Error('Direct legacy server does not route workspace arguments; use the routed CLI/MCP server.');
        const scope = route ? route({ workspace: args.workspace ?? args.expectedWorkspace, taskId: args.taskId }) : legacyScope;
        const value = await handler(args, ctx, scope);
        lifecycle?.publish(scope);
        return { content: [{ type: 'text', text: JSON.stringify(value) }, { type: 'text', text: toolFeedback(name, value) }] };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: error.message }, { type: 'text', text: `Agent Teams · ${name} 未成功\n${name === 'teams_models' ? '本次调用未启动新成员；模型确认没有完成，不得假定用户已同意。' : '请主 Agent 核对错误及当前记录后继续；此回执不代表成功。'}\n原因：${error.message}` }] };
      }
    });
  };
  const terminalGuidance = 'Use a host supporting MCP form confirmation, or finish/cancel active tasks and wait for exit, then close the MCP session holding this workspace before using CLI start/run with the same config and target workspace in a real interactive terminal (stdin and stderr must both be TTY). The state store allows one owner per workspace; running CLI alongside its owner or in a non-TTY shell cannot confirm.';
  const confirmations = new Map();
  const confirmationFor = scope => {
    const key = route ? scope.workspace : 'legacy-default';
    if (!confirmations.has(key)) confirmations.set(key, { confirming: false, selection: null });
    return confirmations.get(key);
  };
  const selectionFor = (catalog, scope) => {
    const saved = scope.observe?.().modelPreference;
    const candidate = confirmationFor(scope).selection ?? (saved?.scope === 'workspace' ? saved : null);
    if (!candidate) return { selection: null, confirmationRequired: true, confirmationIssue: null };
    try { return { selection: validateModelSelection(candidate, catalog, workspaceIdentity(catalog.workspace)), confirmationRequired: false, confirmationIssue: null }; }
    catch (error) { return { selection: null, confirmationRequired: true, confirmationIssue: error.message }; }
  };
  tool('teams_models', 'Read live models and exact target without inference. confirm=true asks the HOST USER to choose roles; remember defaults on in the form and may be disabled. Only explicitly submitted answers save choices. Never supply answers. forget=true revokes saved and session selections. Before every start, saved choices are revalidated; unsupported/cancelled forms never grant approval.', z.strictObject({ workspace, confirm: z.boolean().default(false), forget: z.boolean().default(false) }), async ({ confirm, forget }, ctx, scope) => {
    if (!scope.discoverModels) throw new Error('Host model discovery is unavailable.');
    const confirmation = confirmationFor(scope);
    if (confirmation.confirming) throw new Error('Model confirmation is already in progress.');
    if (confirm && forget) throw new Error('Choose confirm or forget, not both.');
    if (forget) {
      scope.getRuntime().forgetModels(); confirmation.selection = null;
      return { status: 'forgotten', confirmationRequired: true, inferenceStarted: false };
    }
    if (!confirm) {
      const catalog = await scope.discoverModels();
      return { ...catalog, target: workspaceIdentity(catalog.workspace), ...selectionFor(catalog, scope), captainSelectionSupported: true };
    }
    confirmation.confirming = true;
    try {
      const catalog = await scope.discoverModels(), target = workspaceIdentity(catalog.workspace);
      const capabilities = server.server.getClientCapabilities()?.elicitation;
      // Official SDK compatibility: an empty elicitation object declares legacy form support.
      // An absent declaration or a URL-only declaration cannot receive a form.
      if (!capabilities || (!capabilities.form && Object.keys(capabilities).length)) {
        const reason = !capabilities ? 'Host does not support MCP form confirmation: no elicitation capability was declared.' : 'Host does not support MCP form confirmation: elicitation was declared without form support (for example URL-only).';
        throw new Error(`${reason} ${terminalGuidance} No selection changed and no inference started.`);
      }
      const existing = scope.peekRuntime?.();
      if (existing?.active.size || existing?.verification) throw new Error('Wait for active execution to exit before changing models.');
      const response = await ctx.mcpReq.elicitInput(modelSelectionForm(catalog, catalog.workspace));
      if (response.action !== 'accept') return { status: response.action, selectionChanged: false, ...selectionFor(catalog, scope), inferenceStarted: false,
        note: `未确认新分工，旧选择保持不变。若没有看到表单，宿主可能直接拒绝。${terminalGuidance} 不得代替用户接受。` };
      if (typeof response.content?.remember !== 'boolean') throw new Error('The submitted form must explicitly include remember=true or remember=false. Confirm again in a host that submits every required field; no selection changed.');
      const refreshed = await scope.discoverModels();
      if (JSON.stringify(target) !== JSON.stringify(workspaceIdentity(refreshed.workspace))) throw new Error('Target workspace changed during confirmation; confirm again.');
      const profiles = acceptedModelRoles(response.content, refreshed);
      confirmation.selection = scope.getRuntime().confirmModels(profiles, 'mcp-elicitation', { remember: response.content.remember === true });
      return { status: 'confirmed', selection: confirmation.selection, workspace: catalog.workspace, inferenceStarted: false };
    } finally { confirmation.confirming = false; }
  });
  tool('teams_create', 'Create an immutable contract. REQUIRED expectedWorkspace is the absolute intended checkout path; mismatch is rejected. Set it from the task context, not blindly from plugin config. auto uses simple only for explicitly simple non-review work. Write tasks require allowedPaths and verification; optional preflight declares requiredFiles/nodeModules. No inference.', taskSchema.safeExtend({ expectedWorkspace: z.string().min(1) }), (args, ctx, scope) => scope.getRuntime().create(args));
  tool('teams_start', 'Start with explicit captain models (expert and optional simple), or a valid user preference. Human model confirmation is optional; never treat decline as consent. Rechecks live models/efforts and target. Consumes quota. Task model/effort overrides are explicit; reviews and retries use expert.', z.strictObject({
    workspace: dispatchWorkspace, taskId: id, retry: z.boolean().default(false), reason: z.string().default(''),
    models: modelRolesSchema.optional(), hostTicket: z.string().uuid().optional(),
  }), async ({ taskId, workspace: targetWorkspace, models, hostTicket, ...options }, ctx, scope) => {
    const binding = lifecycle?.claim(scope, taskId, hostTicket);
    const confirmation = confirmationFor(scope);
    if (confirmation.confirming) throw new Error('Wait for model confirmation to finish.');
    const catalog = await scope.discoverModels();
    if (binding) { lifecycle.check(binding); options.host = binding.host; }
    // A form may have opened while model discovery was in flight.
    if (confirmation.confirming) throw new Error('Wait for model confirmation to finish.');
    if (models) {
      const receipt = scope.getRuntime().start(taskId, { ...options, models, catalog });
      if (binding) lifecycle.started(binding, receipt.attemptId);
      return receipt;
    }
    const state = selectionFor(catalog, scope);
    if (!state.selection) throw new Error(`User model confirmation or explicit captain models required. Pass models to teams_start, or optionally confirm preferences. ${state.confirmationIssue ?? ''}`);
    const current = scope.getRuntime();
    if (!current.modelConfirmation) current.restoreModels(state.selection, catalog);
    const receipt = current.start(taskId, { ...options, catalog });
    if (binding) lifecycle.started(binding, receipt.attemptId);
    return receipt;
  }, false, true);
  tool('teams_status', 'Read task result or project history without starting members. Prefer overview=true with projection="summary" for identity/counts, or "catalog" for bounded task rows; omit projection for the existing full overview. taskId alone returns compact task evidence; verbose=true returns the full report. incremental/afterCursor track one task. panel=true opens a read-only loopback page; optional taskIds explicitly select this run, not an inferred host session. The page can switch to all project history. No native sub-agent UI or automatic wakeup; reports still need review.', z.strictObject({ workspace, taskId: id.optional(), overview: z.boolean().default(false), panel: z.boolean().default(false), taskIds: z.array(id.max(256)).max(100).optional(), projection: z.enum(['summary', 'catalog']).optional(), verbose: z.boolean().default(false), incremental: z.boolean().default(false), afterCursor, limit: z.number().int().min(1).max(100).default(20) }), async ({ taskId, overview, panel, taskIds, projection, verbose, incremental, afterCursor, limit }, ctx, scope) => {
    if (taskIds !== undefined && !panel) throw new Error('taskIds selection requires panel=true');
    if (projection && (!overview || panel || taskId || verbose || incremental || afterCursor)) throw new Error('projection requires overview=true without taskId, panel, verbose or incremental observation');
    if ((incremental || afterCursor) && (!taskId || overview || panel || verbose)) throw new Error('Incremental observation requires taskId and cannot combine with overview, panel or verbose.');
    if (panel) {
      if (taskId || overview || verbose) throw new Error('panel cannot combine with taskId, overview or verbose; use taskIds to select a run');
      if (panelsClosing) throw new Error('Status panels are closing');
      if (!scope.observe) throw new Error('Live status requires a read-only observer');
      const snapshot = scope.observe(), target = snapshot.target;
      if (!target?.root) throw new Error('Live status requires an identified target workspace');
      statusOverview(snapshot, { taskIds, limit, projection: 'summary' });
      const key = JSON.stringify([target.root, taskIds?.toSorted() ?? null, limit]);
      if (!panels.has(key)) {
        const pending = startStatusPanel(() => scope.observe(), { taskIds, limit });
        panels.set(key, pending);
        void pending.catch(() => { if (panels.get(key) === pending) panels.delete(key); });
      }
      const viewer = await panels.get(key);
      if (panelsClosing) throw new Error('Status panels are closing');
      return { panel: { url: viewer.url, refreshMs: viewer.refreshMs, scope: taskIds === undefined ? 'workspace' : 'selected-tasks', ...(taskIds === undefined ? {} : { taskIds }), lifetime: 'mcp-connection', readOnly: true }, target };
    }
    const snapshot = scope.observe ? scope.observe(taskId) : { tasks: taskId ? [scope.getRuntime().status(taskId)] : scope.getRuntime().status(), workspaces: scope.getRuntime().workspaceStatus(), owner: { processAlive: true }, stateExists: true };
    if (overview) return statusOverview(snapshot, { limit, projection });
    if (!taskId) return snapshot.tasks.map(t => ({ taskId: t.id, objective: t.objective, title: t.title ?? null, status: t.status, attemptId: t.attempts.at(-1)?.id, dependencies: t.dependencies, phase: t.attempts.at(-1)?.phase ?? null }));
    const task = snapshot.tasks[0];
    if (incremental || afterCursor) return observer.observe(task, snapshot, { afterCursor });
    return verbose ? task : observedTaskView(task, snapshot);
  }, true);
  tool('teams_wait', 'Wait up to 300 seconds for one active task. Returns a compact summary; timeout does not cancel the member. verbose=true returns the unreduced record. Prefer doing independent work before waiting.', z.strictObject({
    workspace, taskId: id, timeoutMs: z.number().int().min(0).max(300000).default(10000), verbose: z.boolean().default(false), incremental: z.boolean().default(false), afterCursor,
  }), async ({ taskId, timeoutMs, verbose, incremental, afterCursor }, ctx, scope) => {
    if ((incremental || afterCursor) && verbose) throw new Error('Incremental observation cannot combine with verbose.');
    // Validate before acquiring a runtime or waiting; malformed cursors never mutate state.
    if (afterCursor && scope.observe) {
      const snapshot = scope.observe(taskId);
      observer.observe(snapshot.tasks[0], snapshot, { afterCursor });
    } else if (afterCursor) observer.decode(afterCursor);
    const current = scope.getRuntime();
    const task = await current.wait(taskId, timeoutMs);
    if (incremental || afterCursor) {
      const snapshot = scope.observe ? scope.observe(taskId) : { tasks: [task], workspaces: current.workspaceStatus(), owner: { processAlive: true } };
      return observer.observe(snapshot.tasks[0], snapshot, { afterCursor });
    }
    return verbose ? task : taskView(task, current.workspaceStatus());
  }, true);
  tool('teams_review', 'Captain must inspect evidence against EVERY acceptance criterion. Passing read-only tasks unlocks dependents; passing write tasks waits for explicit integration and source verification. Execution tasks also require a current passed command receipt, unchanged worktree and intact logs bound to this exact attempt. Returns a compact receipt; full report and review evidence remain available through teams_status(verbose=true). This records captain attestation, not independent machine verification or user approval.', reviewSchema.safeExtend({ workspace }), ({ workspace: targetWorkspace, ...args }, ctx, scope) => {
    const current = scope.getRuntime(), task = current.review(args);
    const view = taskView(task, current.workspaceStatus()), attempt = task.attempts.at(-1);
    return { taskId: task.id, attemptId: attempt.id, status: task.status, phaseLabel: view.phaseLabel,
      nextActor: view.nextActor, nextAction: view.nextAction.slice(0, 400), memberExitConfirmed: view.memberExitConfirmed,
      independentReview: view.independentReview, verification: view.verification?.status ?? null,
      review: { verdict: attempt.review.verdict, authority: attempt.review.authority, at: attempt.review.at, evidenceCount: attempt.review.evidence.length } };
  });
  tool('teams_integrate', 'Explicitly apply the current captain-approved write patch to the unchanged source workspace, preserving its index. Runs post-integration verification; only then succeeds. Does not commit or push. Use teams_wait/status/cancel for progress.', z.strictObject({ workspace: dispatchWorkspace, taskId: id, attemptId: id, hostTicket: z.string().uuid().optional() }), ({ taskId, attemptId, hostTicket }, ctx, scope) => {
    const binding = lifecycle?.claim(scope, taskId, hostTicket);
    if (binding) lifecycle.check(binding);
    const receipt = scope.getRuntime().integrate(taskId, attemptId);
    if (binding) lifecycle.started(binding, receipt.attemptId);
    return receipt;
  }, false, true);
  tool('teams_cancel', 'Cancel a task and wait for managed member/reviewer/command exit. Optional cleanup removes its latest worktree; explicit discard is required for changed content. Succeeded tasks keep their status. Records/logs are retained. Integration cancellation retains applied source changes.', z.strictObject({ workspace, taskId: id, cleanup: z.boolean().default(false), discard: z.boolean().default(false) }), async ({ taskId, cleanup, discard }, ctx, scope) => {
    const current = scope.getRuntime();
    const task = await current.cancel(taskId);
    const workspaceId = task.attempts.at(-1)?.workspaceId;
    if (cleanup && workspaceId) current.removeWorkspace(workspaceId, { discard });
    return task;
  }, false, true);
  return server;
}

export async function serve(runtimeOrFactory, options = {}) {
  let runtime = typeof runtimeOrFactory === 'function' ? undefined : runtimeOrFactory;
  let closing;
  const getRuntime = () => {
    if (closing) throw new Error('Runtime is closing');
    return runtime ??= runtimeOrFactory();
  };
  const lifecycle = options.hostLifecycle ? await startHostLifecycle(options.route) : undefined;
  const server = createMcpServer(getRuntime, { ...options, lifecycle, ...(options.route ? { route: args => {
    if (closing) throw new Error('Runtime is closing');
    return options.route(args);
  } } : {}) });
  const transport = new StdioServerTransport();
  const close = () => closing ??= (async () => {
    // Revoke the endpoint while this connection still owns its workspaces.
    // A successor must not publish between owner release and old endpoint cleanup.
    try { await lifecycle?.close(); }
    finally { try { if (options.closeAll) await options.closeAll(); else await runtime?.close(); } finally { await server.close(); } }
  })();
  const onclose = server.server.onclose;
  server.server.onclose = () => { onclose?.(); void close().catch(error => console.error(error.message)); };
  const shutdown = () => { void close().catch(error => { console.error(error.message); process.exitCode = 1; }); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  process.stdin.once('end', shutdown);
  await server.connect(transport);
  return { server, close };
}
