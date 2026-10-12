import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { taskSchema, reviewSchema } from './contracts.js';

export function createMcpServer(runtime) {
  const getRuntime = () => typeof runtime === 'function' ? runtime() : runtime;
  const server = new McpServer({ name: 'codex-agent-teams', version: '0.2.0' });
  const id = z.string().min(1);
  const tool = (name, description, schema, handler, readOnly = false, destructive = false) => {
    server.registerTool(name, {
      description, inputSchema: schema,
      annotations: { readOnlyHint: readOnly, destructiveHint: destructive, openWorldHint: !readOnly },
    }, async args => {
      try {
        const value = await handler(args);
        return { content: [{ type: 'text', text: JSON.stringify(value) }] };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: error.message }] };
      }
    });
  };
  tool('teams_create', 'Create one immutable task contract. Write mode requires expert, allowedPaths and verification; member writes only its worktree and source integration remains explicit. Accuracy and completion efficiency first. No model call yet. Dependencies must already exist. Optional execution captures a fresh Git worktree per attempt and runs the explicitly authorized verification command after member exit; member mode is explicitly specified by contract.', taskSchema, args => getRuntime().create(args));
  tool('teams_start', 'Start a fresh Codex member for an authorized task. Consumes model quota. Use explicit retry plus new reason after failure; retry uses expert. No recursive delegation.', z.strictObject({
    taskId: id, retry: z.boolean().default(false), reason: z.string().default(''),
  }), ({ taskId, ...options }) => getRuntime().start(taskId, options), false, true);
  tool('teams_status', 'Read task result or compact task list. A member report is not accepted until reviewed. Avoid repetitive polling.', z.strictObject({ taskId: id.optional() }), ({ taskId }) => {
    const state = getRuntime().status(taskId);
    return taskId ? state : state.map(t => ({ taskId: t.id, objective: t.objective, status: t.status, attemptId: t.attempts.at(-1)?.id, dependencies: t.dependencies }));
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

export async function serve(runtimeOrFactory) {
  let runtime = typeof runtimeOrFactory === 'function' ? undefined : runtimeOrFactory;
  let closing;
  const getRuntime = () => {
    if (closing) throw new Error('Runtime is closing');
    return runtime ??= runtimeOrFactory();
  };
  const server = createMcpServer(getRuntime);
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
