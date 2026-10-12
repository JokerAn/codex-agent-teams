import { overview as statusOverview } from './status.js';
import packageInfo from '../package.json' with { type: 'json' };
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { taskSchema, reviewSchema } from './contracts.js';
import { modelSelectionForm, acceptedModelRoles, validateModelSelection } from './models.js';
import { workspaceIdentity } from './workspace.js';

export function createMcpServer(runtime, { observe, discoverModels } = {}) {
  const getRuntime = () => typeof runtime === 'function' ? runtime() : runtime;
  const server = new McpServer({ name: 'codex-agent-teams', version: packageInfo.version });
  const id = z.string().min(1);
  const tool = (name, description, schema, handler, readOnly = false, destructive = false) => {
    server.registerTool(name, {
      description, inputSchema: schema,
      annotations: { readOnlyHint: readOnly, destructiveHint: destructive, openWorldHint: !readOnly },
    }, async (args, ctx) => {
      try {
        const value = await handler(args, ctx);
        return { content: [{ type: 'text', text: JSON.stringify(value) }] };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: error.message }] };
      }
    });
  };
  let confirming = false, confirmedSelection = null;
  const selectionFor = catalog => {
    const saved = observe?.().modelPreference;
    const candidate = confirmedSelection ?? (saved?.scope === 'workspace' ? saved : null);
    if (!candidate) return { selection: null, confirmationRequired: true, confirmationIssue: null };
    try { return { selection: validateModelSelection(candidate, catalog, workspaceIdentity(catalog.workspace)), confirmationRequired: false, confirmationIssue: null }; }
    catch (error) { return { selection: null, confirmationRequired: true, confirmationIssue: error.message }; }
  };
  tool('teams_models', 'Read live models and exact target without inference. confirm=true asks the HOST USER to choose roles and optionally remember this workspace. Never supply answers. forget=true revokes saved and session selections. Before every start, saved choices are revalidated; unsupported/cancelled forms never grant approval.', z.strictObject({ confirm: z.boolean().default(false), forget: z.boolean().default(false) }), async ({ confirm, forget }, ctx) => {
    if (!discoverModels) throw new Error('Host model discovery is unavailable.');
    if (confirming) throw new Error('Model confirmation is already in progress.');
    if (confirm && forget) throw new Error('Choose confirm or forget, not both.');
    if (forget) {
      getRuntime().forgetModels(); confirmedSelection = null;
      return { status: 'forgotten', confirmationRequired: true, inferenceStarted: false };
    }
    if (!confirm) {
      const catalog = await discoverModels();
      return { ...catalog, target: workspaceIdentity(catalog.workspace), ...selectionFor(catalog) };
    }
    confirming = true;
    try {
      const catalog = await discoverModels(), target = workspaceIdentity(catalog.workspace);
      const capabilities = server.server.getClientCapabilities()?.elicitation;
      if (!capabilities || (!capabilities.form && Object.keys(capabilities).length)) throw new Error('Host does not support MCP form confirmation. Use the interactive CLI start/run; no models selected and no inference started.');
      const current = getRuntime();
      if (current.active.size || current.verification) throw new Error('Wait for active execution to exit before changing models.');
      const response = await ctx.mcpReq.elicitInput(modelSelectionForm(catalog, catalog.workspace));
      if (response.action !== 'accept') return { status: response.action, selectionChanged: false, ...selectionFor(catalog), inferenceStarted: false,
        note: '未确认新分工。若没有看到表单，宿主可能直接拒绝；可使用交互式 CLI start/run。不得代替用户接受。' };
      const refreshed = await discoverModels();
      if (JSON.stringify(target) !== JSON.stringify(workspaceIdentity(refreshed.workspace))) throw new Error('Target workspace changed during confirmation; confirm again.');
      const profiles = acceptedModelRoles(response.content, refreshed);
      confirmedSelection = current.confirmModels(profiles, 'mcp-elicitation', { remember: response.content.remember === true });
      return { status: 'confirmed', selection: confirmedSelection, workspace: catalog.workspace, inferenceStarted: false };
    } finally { confirming = false; }
  });
  tool('teams_create', 'Create an immutable contract. REQUIRED expectedWorkspace is the absolute intended checkout path; mismatch is rejected. Set it from the task context, not blindly from plugin config. auto uses simple only for explicitly simple non-review work. Write tasks require allowedPaths and verification; optional preflight declares requiredFiles/nodeModules. No inference.', taskSchema.safeExtend({ expectedWorkspace: z.string().min(1) }), args => getRuntime().create(args));
  tool('teams_start', 'Start only after user model confirmation, or an explicitly remembered valid workspace selection. Rechecks live models and target. Consumes quota. Retries require a new reason and use expert.', z.strictObject({
    taskId: id, retry: z.boolean().default(false), reason: z.string().default(''),
  }), async ({ taskId, ...options }) => {
    if (confirming) throw new Error('Wait for model confirmation to finish.');
    const catalog = await discoverModels();
    // A form may have opened while model discovery was in flight.
    if (confirming) throw new Error('Wait for model confirmation to finish.');
    const state = selectionFor(catalog);
    if (!state.selection) throw new Error(`User model confirmation required. ${state.confirmationIssue ?? 'Call teams_models with confirm=true before starting members.'}`);
    const current = getRuntime();
    if (!current.modelConfirmation) current.restoreModels(state.selection, catalog);
    return current.start(taskId, options);
  }, false, true);
  tool('teams_status', 'Read task result or compact list. overview=true shows plugin version/source, recorded runtime identity, task phases, elapsed time and evidence summaries without starting members. Share meaningful changes with the user; a report is pending until reviewed. Avoid repetitive polling.', z.strictObject({ taskId: id.optional(), overview: z.boolean().default(false), limit: z.number().int().min(1).max(100).default(20) }), ({ taskId, overview, limit }) => {
    const snapshot = observe ? observe(taskId) : { tasks: taskId ? [getRuntime().status(taskId)] : getRuntime().status(), workspaces: getRuntime().workspaceStatus(), owner: null, stateExists: true };
    if (overview) return statusOverview(snapshot, { limit });
    return taskId ? snapshot.tasks[0] : snapshot.tasks.map(t => ({ taskId: t.id, objective: t.objective, status: t.status, attemptId: t.attempts.at(-1)?.id, dependencies: t.dependencies, phase: t.attempts.at(-1)?.phase ?? null }));
  }, true);
  tool('teams_wait', 'Wait up to 30 seconds for one active task. Returns current state; timeout does not cancel the member. Prefer doing independent work before waiting.', z.strictObject({
    taskId: id, timeoutMs: z.number().int().min(0).max(30000).default(10000),
  }), ({ taskId, timeoutMs }) => getRuntime().wait(taskId, timeoutMs), true);
  tool('teams_review', 'Captain must inspect evidence against EVERY acceptance criterion. Passing read-only tasks unlocks dependents; passing write tasks waits for explicit integration and source verification. Execution tasks also require a current passed command receipt, unchanged worktree and intact logs bound to this exact attempt. This records captain attestation, not independent machine verification or user approval.', reviewSchema, args => getRuntime().review(args));
  tool('teams_integrate', 'Explicitly apply the current captain-approved write patch to the unchanged source workspace, preserving its index. Runs post-integration verification; only then succeeds. Does not commit or push. Use teams_wait/status/cancel for progress.', z.strictObject({ taskId: id, attemptId: id }), ({ taskId, attemptId }) => getRuntime().integrate(taskId, attemptId), false, true);
  tool('teams_cancel', 'Cancel a task and wait for managed member/reviewer/command exit. Optional cleanup removes its latest worktree; explicit discard is required for changed content. Succeeded tasks keep their status. Records/logs are retained. Integration cancellation retains applied source changes.', z.strictObject({ taskId: id, cleanup: z.boolean().default(false), discard: z.boolean().default(false) }), async ({ taskId, cleanup, discard }) => {
    const task = await getRuntime().cancel(taskId);
    const workspaceId = task.attempts.at(-1)?.workspaceId;
    if (cleanup && workspaceId) getRuntime().removeWorkspace(workspaceId, { discard });
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
  const server = createMcpServer(getRuntime, options);
  const transport = new StdioServerTransport();
  const close = () => closing ??= (async () => { await runtime?.close(); await server.close(); })();
  server.server.onclose = () => { void close().catch(error => console.error(error.message)); };
  const shutdown = () => { void close().catch(error => { console.error(error.message); process.exitCode = 1; }); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  process.stdin.once('end', shutdown);
  await server.connect(transport);
  return { server, close };
}
