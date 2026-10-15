#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      workspace: { type: 'string' }, forget: { type: 'boolean' }, config: { type: 'string' }, task: { type: 'string' }, binary: { type: 'string' },
      models: { type: 'string' },
      out: { type: 'string' }, plugin: { type: 'string' }, help: { type: 'boolean' }, strict: { type: 'boolean' },
      reason: { type: 'string' }, retry: { type: 'boolean' }, attempt: { type: 'string' }, spec: { type: 'string' }, id: { type: 'string' }, dirty: { type: 'string' }, allow: { type: 'string', multiple: true }, discard: { type: 'boolean' },
      'check-thread': { type: 'boolean' },
      'host-lifecycle': { type: 'boolean' },
      human: { type: 'boolean' }, overview: { type: 'boolean' }, html: { type: 'string' }, limit: { type: 'string' },
    },
  });
  const command = positionals[0];
  if (values.help || !command) {
    console.log(`Codex Agent Teams — accuracy and completion efficiency first

node src/cli.js doctor [--config <file>] [--binary codex] [--check-thread]
                                         Check host and configured profiles; no inference
node src/cli.js models --config <file>    List Codex model choices and target; no inference
node src/cli.js models --config <file> --forget
                                         Revoke saved/session model choices
--workspace <absolute path>              Target project (global config defaults to current directory)
--models <JSON>                         Explicit expert/simple roles for start/run; no user form
node src/cli.js pack [--out <new directory>] [--strict --config <file>]
                                         Default native skill; --strict includes external delivery runtime
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
node src/cli.js status --config <file> [--id <task-id>] [--human | --overview | --html <new.html>] [--limit 20]
                                         Read-only observation, even while MCP owns the workspace
node src/cli.js review --config <file> --spec <review.json>
node src/cli.js integrate --config <file> --id <task-id> --attempt <attempt-id>
                                         Apply reviewed patch and verify; no commit/push
node src/cli.js run --config <file> --task <json>
                                         Run one task; captain review remains pending
                                         start/run/integrate report progress on stderr; stdout stays JSON`);
  } else if (command === 'pack') {
    if (values.strict) {
      const { packPlugin } = await import('./plugin.js');
      console.log(JSON.stringify(packPlugin({ configPath: values.config ?? process.env.TEAMS_CONFIG, out: values.out }), null, 2));
    } else {
      if (values.config || values.binary) throw new Error('--config/--binary require --strict');
      const { packNativePlugin } = await import('./plugin-package.js');
      console.log(JSON.stringify(packNativePlugin({ out: values.out }), null, 2));
    }
  } else {
    // Packaging/help stay dependency-free; execution loads the strict modules only here.
    const [status, progress, configuration, backend, models, workspace] = await Promise.all([
      import('./status.js'), import('./cli-progress.js'), import('./config.js'),
      import('./app-server.js'), import('./models.js'), import('./workspace.js'),
    ]);
    const { pluginIdentity, readSnapshot, overview, renderText, renderHtml, toolFeedback } = status;
    const { waitWithProgress } = progress;
    const { loadConfig, configForWorkspace } = configuration;
    const { CodexBackend } = backend;
    const { confirmModelsInTerminal, validateModelSelection } = models;
    const { workspaceIdentity, assertWorkspace } = workspace;
    if (command === 'models' && !values.forget) {
      const config = configForWorkspace(loadConfig(values.config ?? process.env.TEAMS_CONFIG), values.workspace);
      const { models, configuredModel, configuredEffort } = await new CodexBackend({ binary: config.codexBin }).probe(config.workspace, { modelSettings: true });
      console.log(JSON.stringify({ workspace: config.workspace, target: workspaceIdentity(config.workspace), models, configuredModel, configuredEffort, inferenceStarted: false }, null, 2));
    } else if (command === 'doctor') {
      const plugin = values.plugin ? (await import('./plugin.js')).pluginTarget(values.plugin) : undefined;
      const configPath = values.config ?? process.env.TEAMS_CONFIG ?? plugin?.configPath;
      const config = configPath ? configForWorkspace(loadConfig(configPath), values.workspace) : undefined;
      const result = await new CodexBackend({ binary: values.binary ?? config?.codexBin ?? 'codex' }).probe(config?.workspace ?? process.cwd(), {
        checkThread: values['check-thread'] ?? false, profiles: config?.profiles, plugin,
      });
      console.log(JSON.stringify(result, null, 2));
    } else if (command === 'status') {
      const config = configForWorkspace(loadConfig(values.config ?? process.env.TEAMS_CONFIG), values.workspace);
      if ([values.human, values.overview, values.html].filter(Boolean).length > 1) throw new Error('Choose one of --human, --overview or --html');
      const snapshot = readSnapshot(config.workspace, values.id);
      if (values.human || values.overview || values.html) {
        const report = overview(snapshot, { limit: values.limit === undefined ? 20 : Number(values.limit) });
        if (values.html) {
          if (!values.html.endsWith('.html')) throw new Error('Status page output must end in .html');
          writeFileSync(values.html, renderHtml(report), { flag: 'wx', mode: 0o600 });
          console.log(JSON.stringify({ path: values.html, capturedAt: report.capturedAt, viewer: report.viewer, runtime: report.runtime }, null, 2));
        } else console.log(values.human ? renderText(report) : JSON.stringify(report, null, 2));
      } else console.log(JSON.stringify(values.id ? snapshot.tasks[0] : snapshot.tasks, null, 2));
    } else if (['mcp', 'run', 'workspace', 'review', 'integrate', 'start', 'cancel', 'models'].includes(command)) {
      if (process.env.CODEX_TEAMS_MEMBER === '1') throw new Error('Members cannot start another team runtime');
      const settings = loadConfig(values.config ?? process.env.TEAMS_CONFIG);
      const config = command === 'mcp' ? settings : configForWorkspace(settings, values.workspace);
      const { TaskStore } = await import('./store.js');
      const { TaskRuntime } = await import('./runtime.js');
      const discoverModels = async () => {
        const { models, configuredModel, configuredEffort } = await new CodexBackend({ binary: config.codexBin }).probe(config.workspace, { modelSettings: true });
        return { workspace: config.workspace, models, configuredModel, configuredEffort, inferenceStarted: false };
      };
      const createRuntime = () => new TaskRuntime(new TaskStore(join(config.workspace, '.codex-teams', 'state.sqlite'), pluginIdentity()), new CodexBackend({ binary: config.codexBin }), config, { requireModelConfirmation: true });
      if (command === 'mcp') {
        const { serve } = await import('./mcp.js');
        const { WorkspaceRouter } = await import('./workspace-router.js');
        const router = new WorkspaceRouter(settings);
        await serve(undefined, { route: args => router.resolve(args), closeAll: () => router.close(), hostLifecycle: values['host-lifecycle'] === true });
      } else {
        const runtime = createRuntime();
        const terminalCancellation = new AbortController();
        // Signal handling stops execution, but the foreground caller still needs the final receipt.
        // Close the store only in finally, after it has read and printed that terminal state.
        const stop = () => {
          terminalCancellation.abort(new Error('Cancelled by operator'));
          runtime.closing = true;
          for (const id of runtime.active.keys()) void runtime.cancel(id).catch(error => console.error(error.message));
          runtime.verification?.controller.abort(new Error('Cancelled by operator'));
        };
        if (command === 'workspace') {
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
          process.once('SIGINT', stop); process.once('SIGTERM', stop);
          try {
            let dispatch;
            if (command === 'models') {
              runtime.forgetModels();
              console.log(JSON.stringify({ status: 'forgotten', confirmationRequired: true, inferenceStarted: false }));
            }
            if (['start', 'run'].includes(command)) {
              const target = workspaceIdentity(config.workspace);
              assertWorkspace(values.workspace ?? process.cwd(), target);
              let catalog = await discoverModels();
              const saved = runtime.store.modelPreference();
              if (values.models) {
                const { validateDispatchModels } = await import('./models.js');
                dispatch = { models: validateDispatchModels(JSON.parse(values.models), catalog), catalog };
              } else if (saved?.scope === 'workspace') {
                try { runtime.restoreModels(saved, catalog); }
                catch (error) { console.error(`已保存分工不可复用：${error.message}`); }
              }
              if (!dispatch && !runtime.modelConfirmation) {
                const selection = await confirmModelsInTerminal(catalog, config.workspace, { signal: terminalCancellation.signal });
                const refreshed = await discoverModels();
                assertWorkspace(target, workspaceIdentity(config.workspace));
                // Validate the latest catalog before persisting user input.
                const { acceptedModelRoles } = await import('./models.js');
                acceptedModelRoles({ expert: JSON.stringify(selection.profiles.expert), simple: selection.profiles.simple ? JSON.stringify(selection.profiles.simple) : 'none', confirm: true }, refreshed);
                runtime.confirmModels(selection.profiles, 'interactive-terminal', { remember: selection.remember });
                catalog = refreshed;
              }
              if (!dispatch) {
                validateModelSelection(runtime.modelConfirmation, catalog, target);
                dispatch = { catalog };
              }
            }
            if (command === 'models') { /* Revocation already completed. */ } else if (command === 'cancel') {
              if (!values.id) throw new Error('cancel requires --id');
              console.log(JSON.stringify(await runtime.cancel(values.id), null, 2));
            } else if (command === 'start') {
              if (!values.id) throw new Error('start requires --id');
              const started = runtime.start(values.id, { retry: values.retry ?? false, reason: values.reason ?? '', ...dispatch });
              process.stderr.write(toolFeedback('teams_start', started) + '\n');
              const result = await waitWithProgress(runtime, values.id);
              console.log(JSON.stringify(result, null, 2));
              if (result.status !== 'awaiting_review') process.exitCode = 1;
            } else if (command === 'review') {
              if (!values.spec) throw new Error('review requires --spec <review.json>');
              console.log(JSON.stringify(runtime.review(JSON.parse(readFileSync(values.spec, 'utf8'))), null, 2));
            } else if (command === 'integrate') {
              if (!values.id || !values.attempt) throw new Error('integrate requires --id and --attempt');
              runtime.integrate(values.id, values.attempt);
              const result = await waitWithProgress(runtime, values.id);
              console.log(JSON.stringify(result, null, 2));
              if (result.status !== 'succeeded') process.exitCode = 1;
            } else {
              if (!values.task) throw new Error('run requires --task <json file>');
              const input = JSON.parse(readFileSync(values.task, 'utf8'));
              const task = runtime.create({ ...input, expectedWorkspace: input.expectedWorkspace ?? values.workspace ?? process.cwd() });
              const started = runtime.start(task.id, dispatch);
              process.stderr.write(toolFeedback('teams_start', started) + '\n');
              const result = await waitWithProgress(runtime, task.id);
              console.log(JSON.stringify(result, null, 2));
              if (result.status !== 'awaiting_review') process.exitCode = 1;
            }
          } finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); await runtime.close(); }
        }
      }
    } else throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
