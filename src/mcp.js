import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { taskSchema, reviewSchema } from './contracts.js';

export function createMcpServer(runtime) {
  const server = new McpServer({ name: 'codex-agent-teams', version: '0.1.0' });
  const id = z.string().min(1);
  const tool = (name, description, schema, handler, readOnly = false) => {
    server.registerTool(name, {
      description, inputSchema: schema,
      annotations: { readOnlyHint: readOnly, destructiveHint: false, openWorldHint: !readOnly },
    }, async args => {
      try {
        const value = await handler(args);
        return { content: [{ type: 'text', text: JSON.stringify(value) }] };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: error.message }] };
      }
    });
  };
  tool('teams_create', 'Create one immutable read-only task contract. Accuracy and completion efficiency first. No model call yet. Dependencies must already exist.', taskSchema, args => runtime.create(args));
  tool('teams_start', 'Start a fresh Codex member for an authorized task. Consumes model quota. Use explicit retry plus new reason after failure; retry uses expert. No recursive delegation.', z.strictObject({
    taskId: id, retry: z.boolean().default(false), reason: z.string().default(''),
  }), ({ taskId, ...options }) => runtime.start(taskId, options));
  tool('teams_status', 'Read task result or compact task list. A member report is not accepted until reviewed. Avoid repetitive polling.', z.strictObject({ taskId: id.optional() }), ({ taskId }) => {
    const state = runtime.status(taskId);
    return taskId ? state : state.map(t => ({ taskId: t.id, objective: t.objective, status: t.status, attemptId: t.attempts.at(-1)?.id, dependencies: t.dependencies }));
  }, true);
  tool('teams_wait', 'Wait up to 30 seconds for one active task. Returns current state; timeout does not cancel the member. Prefer doing independent work before waiting.', z.strictObject({
    taskId: id, timeoutMs: z.number().int().min(0).max(30000).default(10000),
  }), ({ taskId, timeoutMs }) => runtime.wait(taskId, timeoutMs), true);
  tool('teams_review', 'Captain must inspect evidence against EVERY acceptance criterion. Pass unlocks dependents. This records captain attestation, not independent machine verification or user approval.', reviewSchema, args => runtime.review(args));
  tool('teams_cancel', 'Cancel a task and wait for its managed member to exit. Does not discard records.', z.strictObject({ taskId: id }), ({ taskId }) => runtime.cancel(taskId));
  return server;
}

export async function serve(runtime) {
  const server = createMcpServer(runtime);
  const transport = new StdioServerTransport();
  let closing;
  const close = () => closing ??= (async () => { await runtime.close(); await server.close(); })();
  server.server.onclose = () => { void close().catch(error => console.error(error.message)); };
  const shutdown = () => { void close().catch(error => { console.error(error.message); process.exitCode = 1; }); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  process.stdin.once('end', shutdown);
  await server.connect(transport);
  return { server, close };
}
