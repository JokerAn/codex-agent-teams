#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './config.js';
import { CodexBackend } from './app-server.js';

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: 'string' }, task: { type: 'string' }, binary: { type: 'string' },
      out: { type: 'string' }, plugin: { type: 'string' }, help: { type: 'boolean' },
      reason: { type: 'string' }, retry: { type: 'boolean' }, attempt: { type: 'string' }, spec: { type: 'string' }, id: { type: 'string' }, dirty: { type: 'string' }, allow: { type: 'string', multiple: true }, discard: { type: 'boolean' },
      'check-thread': { type: 'boolean' },
    },
  });
  const command = positionals[0];
  if (values.help || !command) {
    console.log(`Codex Agent Teams — accuracy and completion efficiency first

node src/cli.js doctor [--config <file>] [--binary codex] [--check-thread]
                                         Check host and configured profiles; no inference
node src/cli.js pack --config <file> [--out <new directory>]
                                         Prepare machine-local plugin; does not install
node src/cli.js doctor --plugin <prepared directory> [--check-thread]
                                         Check host plugin discovery; does not install
node src/cli.js workspace prepare --config <file> [--dirty snapshot]
                                         Capture baseline and detached worktree; no inference
node src/cli.js workspace list --config <file>
node src/cli.js workspace inspect --config <file> --id <id> [--allow <path>]
node src/cli.js workspace verify --config <file> --id <id> --spec <command.json>
                                         Run one explicit command with logs and deadline
node src/cli.js workspace remove --config <file> --id <id> [--discard]
                                         Refuse modified worktrees unless explicitly discarded
node src/cli.js mcp --config <file>        Start local MCP server
node src/cli.js start --config <file> --id <task-id> [--retry --reason <reason>]
node src/cli.js cancel --config <file> --id <task-id>
node src/cli.js status --config <file> [--id <task-id>]
node src/cli.js review --config <file> --spec <review.json>
node src/cli.js integrate --config <file> --id <task-id> --attempt <attempt-id>
                                         Apply reviewed patch and verify; no commit/push
node src/cli.js run --config <file> --task <json>
                                         Run one task; captain review remains pending`);
  } else if (command === 'pack') {
    const { packPlugin } = await import('./plugin.js');
    console.log(JSON.stringify(packPlugin({ configPath: values.config ?? process.env.TEAMS_CONFIG, out: values.out }), null, 2));
  } else if (command === 'doctor') {
    const plugin = values.plugin ? (await import('./plugin.js')).pluginTarget(values.plugin) : undefined;
    const configPath = values.config ?? process.env.TEAMS_CONFIG ?? plugin?.configPath;
    const config = configPath ? loadConfig(configPath) : undefined;
    const result = await new CodexBackend({ binary: values.binary ?? config?.codexBin ?? 'codex' }).probe(config?.workspace ?? process.cwd(), {
      checkThread: values['check-thread'] ?? false, profiles: config?.profiles, plugin,
    });
    console.log(JSON.stringify(result, null, 2));
  } else if (['mcp', 'run', 'workspace', 'status', 'review', 'integrate', 'start', 'cancel'].includes(command)) {
    if (process.env.CODEX_TEAMS_MEMBER === '1') throw new Error('Members cannot start another team runtime');
    const config = loadConfig(values.config ?? process.env.TEAMS_CONFIG);
    const { TaskStore } = await import('./store.js');
    const { TaskRuntime } = await import('./runtime.js');
    const createRuntime = () => new TaskRuntime(new TaskStore(join(config.workspace, '.codex-teams', 'state.sqlite')), new CodexBackend({ binary: config.codexBin }), config);
    if (command === 'mcp') {
      const { serve } = await import('./mcp.js');
      await serve(createRuntime);
    } else {
      const runtime = createRuntime();
      if (command === 'workspace') {
        const stop = () => { void runtime.close().catch(error => console.error(error.message)); };
        process.once('SIGINT', stop); process.once('SIGTERM', stop);
        try {
          let result;
          if (positionals[1] === 'prepare') result = runtime.prepareWorkspace({ dirtyPolicy: values.dirty ?? 'reject' });
          else if (positionals[1] === 'list') result = runtime.workspaceStatus().map(({ id, status, worktreePath, verifications }) => ({ id, status, worktreePath, lastVerification: verifications?.at(-1) }));
          else {
            if (!values.id) throw new Error('workspace inspect/verify/remove requires --id');
            if (positionals[1] === 'inspect') result = runtime.inspectWorkspace(values.id, { allowedPaths: values.allow });
            else if (positionals[1] === 'remove') result = runtime.removeWorkspace(values.id, { discard: values.discard ?? false });
            else if (positionals[1] === 'verify') {
              if (!values.spec) throw new Error('workspace verify requires --spec <command.json>');
              result = await runtime.verifyWorkspace(values.id, JSON.parse(readFileSync(values.spec, 'utf8')));
              if (result.status !== 'passed') process.exitCode = 1;
            } else throw new Error('workspace requires prepare, list, inspect, verify or remove');
          }
          console.log(JSON.stringify(result, null, 2));
        } finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); await runtime.close(); }
      } else {
        const stop = () => { void runtime.close().catch(() => {}); };
        process.once('SIGINT', stop); process.once('SIGTERM', stop);
        try {
          if (command === 'status') {
            console.log(JSON.stringify(runtime.status(values.id), null, 2));
          } else if (command === 'cancel') {
            if (!values.id) throw new Error('cancel requires --id');
            console.log(JSON.stringify(await runtime.cancel(values.id), null, 2));
          } else if (command === 'start') {
            if (!values.id) throw new Error('start requires --id');
            runtime.start(values.id, { retry: values.retry ?? false, reason: values.reason ?? '' });
            const result = await runtime.wait(values.id, config.taskTimeoutMs + 10000);
            console.log(JSON.stringify(result, null, 2));
            if (result.status !== 'awaiting_review') process.exitCode = 1;
          } else if (command === 'review') {
            if (!values.spec) throw new Error('review requires --spec <review.json>');
            console.log(JSON.stringify(runtime.review(JSON.parse(readFileSync(values.spec, 'utf8'))), null, 2));
          } else if (command === 'integrate') {
            if (!values.id || !values.attempt) throw new Error('integrate requires --id and --attempt');
            runtime.integrate(values.id, values.attempt);
            const result = await runtime.wait(values.id, config.taskTimeoutMs + 10000);
            console.log(JSON.stringify(result, null, 2));
            if (result.status !== 'succeeded') process.exitCode = 1;
          } else {
            if (!values.task) throw new Error('run requires --task <json file>');
            const task = runtime.create(JSON.parse(readFileSync(values.task, 'utf8')));
            runtime.start(task.id);
            const result = await runtime.wait(task.id, config.taskTimeoutMs + 10000);
            console.log(JSON.stringify(result, null, 2));
            if (result.status !== 'awaiting_review') process.exitCode = 1;
          }
        } finally { await runtime.close(); }
      }
    }
  } else throw new Error(`Unknown command: ${command}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
