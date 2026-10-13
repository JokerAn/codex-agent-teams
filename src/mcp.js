import { overview as statusOverview, taskView, toolFeedback } from './status.js';
import packageInfo from '../package.json' with { type: 'json' };
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { isAbsolute } from 'node:path';
import { taskSchema, reviewSchema } from './contracts.js';
import { modelSelectionForm, acceptedModelRoles, validateModelSelection } from './models.js';
import { workspaceIdentity } from './workspace.js';

export function createMcpServer(runtime, { observe, discoverModels, route } = {}) {
  const getRuntime = () => typeof runtime === 'function' ? runtime() : runtime;
  const legacyScope = { getRuntime, observe, discoverModels };
  const server = new McpServer({ name: 'codex-agent-teams', version: packageInfo.version });
  const id = z.string().min(1);
  const workspacePath = z.string().min(1).refine(isAbsolute, 'workspace must be an absolute project path');
  const workspace = workspacePath.optional();
  const routingGuidance = ' The captain supplies workspace from the current chat cwd automatically; do not ask the user to type paths. A taskId known in this connection can omit workspace. After reconnecting, supply workspace from the current context to find saved tasks. If multiple projects are known, calls without a taskId need workspace.';
  const tool = (name, description, schema, handler, readOnly = false, destructive = false) => {
    server.registerTool(name, {
      description: description + routingGuidance, inputSchema: schema,
      annotations: { readOnlyHint: readOnly, destructiveHint: destructive, openWorldHint: !readOnly },
    }, async (args, ctx) => {
      try {
        if (!route && args.workspace !== undefined) throw new Error('Direct legacy server does not route workspace arguments; use the routed CLI/MCP server.');
        const scope = route ? route({ workspace: args.workspace ?? args.expectedWorkspace, taskId: args.taskId }) : legacyScope;
        const value = await handler(args, ctx, scope);
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
      return { ...catalog, target: workspaceIdentity(catalog.workspace), ...selectionFor(catalog, scope) };
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
      const current = scope.getRuntime();
      if (current.active.size || current.verification) throw new Error('Wait for active execution to exit before changing models.');
      const response = await ctx.mcpReq.elicitInput(modelSelectionForm(catalog, catalog.workspace));
      if (response.action !== 'accept') return { status: response.action, selectionChanged: false, ...selectionFor(catalog, scope), inferenceStarted: false,
        note: `未确认新分工，旧选择保持不变。若没有看到表单，宿主可能直接拒绝。${terminalGuidance} 不得代替用户接受。` };
      if (typeof response.content?.remember !== 'boolean') throw new Error('The submitted form must explicitly include remember=true or remember=false. Confirm again in a host that submits every required field; no selection changed.');
      const refreshed = await scope.discoverModels();
      if (JSON.stringify(target) !== JSON.stringify(workspaceIdentity(refreshed.workspace))) throw new Error('Target workspace changed during confirmation; confirm again.');
      const profiles = acceptedModelRoles(response.content, refreshed);
      confirmation.selection = current.confirmModels(profiles, 'mcp-elicitation', { remember: response.content.remember === true });
      return { status: 'confirmed', selection: confirmation.selection, workspace: catalog.workspace, inferenceStarted: false };
    } finally { confirmation.confirming = false; }
  });
  tool('teams_create', 'Create an immutable contract. REQUIRED expectedWorkspace is the absolute intended checkout path; mismatch is rejected. Set it from the task context, not blindly from plugin config. auto uses simple only for explicitly simple non-review work. Write tasks require allowedPaths and verification; optional preflight declares requiredFiles/nodeModules. No inference.', taskSchema.safeExtend({ expectedWorkspace: z.string().min(1) }), (args, ctx, scope) => scope.getRuntime().create(args));
  tool('teams_start', 'Start only after user model confirmation, or an explicitly remembered valid workspace selection. Rechecks live models and target. Consumes quota. Retries require a new reason and use expert.', z.strictObject({
    workspace, taskId: id, retry: z.boolean().default(false), reason: z.string().default(''),
  }), async ({ taskId, workspace: targetWorkspace, ...options }, ctx, scope) => {
    const confirmation = confirmationFor(scope);
    if (confirmation.confirming) throw new Error('Wait for model confirmation to finish.');
    const catalog = await scope.discoverModels();
    // A form may have opened while model discovery was in flight.
    if (confirmation.confirming) throw new Error('Wait for model confirmation to finish.');
    const state = selectionFor(catalog, scope);
    if (!state.selection) throw new Error(`User model confirmation required. ${state.confirmationIssue ?? 'Call teams_models with confirm=true before starting members.'}`);
    const current = scope.getRuntime();
    if (!current.modelConfirmation) current.restoreModels(state.selection, catalog);
    return current.start(taskId, options);
  }, false, true);
  tool('teams_status', 'Read task result or compact list. taskId alone returns a compact summary of that task; add verbose=true only when raw per-attempt machine fields (thread id, digests, full review result) are genuinely needed, because that returns the unreduced record. overview=true shows plugin version/source, recorded runtime identity, task phases, elapsed time and evidence summaries without starting members. Share meaningful changes with the user; a report is pending until reviewed. Avoid repetitive polling.', z.strictObject({ workspace, taskId: id.optional(), overview: z.boolean().default(false), verbose: z.boolean().default(false), limit: z.number().int().min(1).max(100).default(20) }), ({ taskId, overview, verbose, limit }, ctx, scope) => {
    const snapshot = scope.observe ? scope.observe(taskId) : { tasks: taskId ? [scope.getRuntime().status(taskId)] : scope.getRuntime().status(), workspaces: scope.getRuntime().workspaceStatus(), owner: null, stateExists: true };
    if (overview) return statusOverview(snapshot, { limit });
    if (!taskId) return snapshot.tasks.map(t => ({ taskId: t.id, objective: t.objective, title: t.title ?? null, status: t.status, attemptId: t.attempts.at(-1)?.id, dependencies: t.dependencies, phase: t.attempts.at(-1)?.phase ?? null }));
    const task = snapshot.tasks[0];
    return verbose ? task : taskView(task, snapshot.workspaces);
  }, true);
  tool('teams_wait', 'Wait up to 300 seconds for one active task. Returns a compact summary; timeout does not cancel the member. verbose=true returns the unreduced record. Prefer doing independent work before waiting.', z.strictObject({
    workspace, taskId: id, timeoutMs: z.number().int().min(0).max(300000).default(10000), verbose: z.boolean().default(false),
  }), async ({ taskId, timeoutMs, verbose }, ctx, scope) => {
    const current = scope.getRuntime();
    const task = await current.wait(taskId, timeoutMs);
    return verbose ? task : taskView(task, current.workspaceStatus());
  }, true);
  tool('teams_review', 'Captain must inspect evidence against EVERY acceptance criterion. Passing read-only tasks unlocks dependents; passing write tasks waits for explicit integration and source verification. Execution tasks also require a current passed command receipt, unchanged worktree and intact logs bound to this exact attempt. This records captain attestation, not independent machine verification or user approval.', reviewSchema.safeExtend({ workspace }), ({ workspace: targetWorkspace, ...args }, ctx, scope) => scope.getRuntime().review(args));
  tool('teams_integrate', 'Explicitly apply the current captain-approved write patch to the unchanged source workspace, preserving its index. Runs post-integration verification; only then succeeds. Does not commit or push. Use teams_wait/status/cancel for progress.', z.strictObject({ workspace, taskId: id, attemptId: id }), ({ taskId, attemptId }, ctx, scope) => scope.getRuntime().integrate(taskId, attemptId), false, true);
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
  const server = createMcpServer(getRuntime, { ...options, ...(options.route ? { route: args => {
    if (closing) throw new Error('Runtime is closing');
    return options.route(args);
  } } : {}) });
  const transport = new StdioServerTransport();
  const close = () => closing ??= (async () => {
    try { if (options.closeAll) await options.closeAll(); else await runtime?.close(); }
    finally { await server.close(); }
  })();
  server.server.onclose = () => { void close().catch(error => console.error(error.message)); };
  const shutdown = () => { void close().catch(error => { console.error(error.message); process.exitCode = 1; }); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  process.stdin.once('end', shutdown);
  await server.connect(transport);
  return { server, close };
}
