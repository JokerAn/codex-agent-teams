#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './config.js';
import { CodexBackend } from './app-server.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { config: { type: 'string' }, task: { type: 'string' }, binary: { type: 'string' }, help: { type: 'boolean' }, 'check-thread': { type: 'boolean' } },
});
try {
  const command = positionals[0];
  if (values.help || !command) {
    console.log(`Codex Agent Teams — accuracy and completion efficiency first

node src/cli.js doctor [--binary codex] [--check-thread]     Handshake and models; no inference
node src/cli.js mcp --config <file>        Start local MCP server
node src/cli.js run --config <file> --task <json>
                                         Run one read-only task; captain review remains pending`);
  } else if (command === 'doctor') {
    const result = await new CodexBackend({ binary: values.binary ?? 'codex' }).probe(process.cwd(), { checkThread: values['check-thread'] ?? false });
    console.log(JSON.stringify(result, null, 2));
  } else if (['mcp', 'run'].includes(command)) {
    if (process.env.CODEX_TEAMS_MEMBER === '1') throw new Error('Members cannot start another team runtime');
    const config = loadConfig(values.config ?? process.env.TEAMS_CONFIG);
    const { TaskStore } = await import('./store.js');
    const { TaskRuntime } = await import('./runtime.js');
    const store = new TaskStore(join(config.workspace, '.codex-teams', 'state.sqlite'));
    const runtime = new TaskRuntime(store, new CodexBackend({ binary: config.codexBin }), config);
    if (command === 'mcp') {
      const { serve } = await import('./mcp.js');
      await serve(runtime);
    } else {
      const stop = () => { void runtime.close().catch(() => {}); };
      process.once('SIGINT', stop); process.once('SIGTERM', stop);
      try {
        if (!values.task) throw new Error('run requires --task <json file>');
        const task = runtime.create(JSON.parse(readFileSync(values.task, 'utf8')));
        runtime.start(task.id);
        const result = await runtime.wait(task.id, config.taskTimeoutMs + 10000);
        console.log(JSON.stringify(result, null, 2));
        if (result.status !== 'awaiting_review') process.exitCode = 1;
      } finally { await runtime.close(); }
    }
  } else throw new Error(`Unknown command: ${command}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
