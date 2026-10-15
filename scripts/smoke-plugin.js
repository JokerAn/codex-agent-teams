import packageInfo from '../package.json' with { type: 'json' };
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { processAlive } from '../src/store.js';
import { AppServerClient } from '../src/app-server.js';
import { packPlugin } from '../src/plugin.js';
import { resolveCodexBin } from './codex-bin.js';

// Explicit host integration check: no inference, no real user-home installation.
const { values } = parseArgs({ options: { binary: { type: 'string', default: 'codex' }, 'approval-policy': { type: 'string', default: 'on-request' } } });
const approvalPolicy = values['approval-policy'];
assert.ok(['never', 'on-request'].includes(approvalPolicy));
const binary = resolveCodexBin(values.binary);
const root = realpathSync(mkdtempSync(join(tmpdir(), 'teams-plugin-smoke-')));
const home = join(root, 'codex-home');
const workspace = join(root, 'workspace');
const secondWorkspace = join(root, 'second-project');
mkdirSync(home); mkdirSync(workspace); mkdirSync(secondWorkspace);
const configPath = join(root, 'teams.config.json');
writeFileSync(configPath, JSON.stringify({ workspace, codexBin: binary, profiles: { expert: { model: 'not-used-no-inference' } } }));
let client, cancelStartup, result, hostThread, cleanupSafe = false;
const startupEvents = [];
try {
  const packed = packPlugin({ configPath, out: join(root, 'marketplace') });
  assert.equal('workspace' in JSON.parse(readFileSync(packed.configPath, 'utf8')), false);
  const env = { ...process.env, CODEX_HOME: home, CODEX_TEAMS_MEMBER: '0' };
  const command = args => JSON.parse(execFileSync(binary, args, { env, encoding: 'utf8', stdio: 'pipe', timeout: 15000 }));
  const marketplace = command(['plugin', 'marketplace', 'add', packed.marketplaceRoot, '--json']);
  const installed = command(['plugin', 'add', 'codex-agent-teams@codex-agent-teams-local', '--json']);
  assert.ok(installed.installedPath.startsWith(home + '/'));
  // Compare the installed definitions before removing the marketplace source.
  assert.deepEqual(readFileSync(join(installed.installedPath, 'hooks/hooks.json')), readFileSync(join(packed.pluginRoot, 'hooks/hooks.json')));
  client = new AppServerClient({ binary, cwd: workspace, env, args: ['app-server', '--stdio', '-c', 'features.hooks=true', '-c', 'features.plugins=true'] });
  const server = await client.initialize(undefined, { experimentalApi: true });
  client.on('notification', (method, params) => {
    if (method.startsWith('mcpServer/')) startupEvents.push({ method, name: params.name, status: params.status, error: params.error });
  });
  const startup = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('Plugin MCP startup timed out')); }, 15000);
    const cleanup = () => { clearTimeout(timer); client.off('notification', notification); client.off('fatal', fatal); };
    cancelStartup = cleanup;
    const fatal = error => { cleanup(); reject(error); };
    const notification = (method, params) => {
      if (method !== 'mcpServer/startupStatus/updated' || params.name !== 'codex-agent-teams') return;
      if (params.status === 'ready') { cleanup(); resolve(params); }
      if (params.status === 'failed' || params.status === 'cancelled') { cleanup(); reject(new Error(params.error ?? `MCP ${params.status}`)); }
    };
    client.on('notification', notification);
    client.on('fatal', fatal);
  });
  // Observe rejection even if thread/start itself fails first.
  void startup.catch(() => {});
  // The outer host must allow user requests to exercise elicitation; no turn is
  // started, and member threads still enforce approvalPolicy=never themselves.
  const started = await client.request('thread/start', { cwd: workspace, sandbox: 'read-only', approvalPolicy, ephemeral: true, config: { 'features.plugins': true } });
  hostThread = started.thread.id;
  const ready = await startup;
  const skills = await client.request('skills/list', { cwds: [workspace], forceReload: true });
  const team = skills.data.flatMap(entry => entry.skills ?? []).find(skill => skill.name === 'codex-agent-teams:team');
  assert.ok(team && team.path.startsWith(installed.installedPath + '/') && existsSync(team.path), 'Cached skill must be discoverable from installed plugin');
  const hookInventory = await client.request('hooks/list', { cwds: [workspace] });
  const pluginHooks = hookInventory.data.flatMap(entry => entry.hooks).filter(hook => hook.source === 'plugin' && hook.sourcePath.startsWith(installed.installedPath + '/'));
  const pluginDetails = await client.request('plugin/read', { marketplacePath: packed.marketplacePath, pluginName: 'codex-agent-teams' });
  assert.deepEqual(pluginDetails.plugin.hooks.map(hook => hook.eventName).sort(), ['interrupt', 'preToolUse', 'sessionEnd'], JSON.stringify({ inventory: hookInventory, hooks: pluginDetails.plugin.hooks }));
  rmSync(packed.pluginRoot, { recursive: true });
  assert.equal(ready.threadId, started.thread.id);
  const inventory = await client.request('mcpServerStatus/list', { threadId: started.thread.id, limit: 100 });
  const mcp = inventory.data.find(entry => entry.name === 'codex-agent-teams');
  assert.deepEqual(Object.keys(mcp?.tools ?? {}).sort(), ['teams_cancel', 'teams_create', 'teams_integrate', 'teams_models', 'teams_review', 'teams_start', 'teams_status', 'teams_wait']);
  const call = (tool, args) => client.request('mcpServer/tool/call', { threadId: started.thread.id, server: 'codex-agent-teams', tool, arguments: args });
  const missingWorkspace = await call('teams_status', { overview: true });
  assert.equal(missingWorkspace.isError, true, 'cache cwd must not become a project');
  const initialStatus = await call('teams_status', { workspace, overview: true });
  assert.ok(!initialStatus.isError);
  assert.match(initialStatus.content[1]?.text ?? '', /Agent Teams · 只读状态观察/);
  const initial = JSON.parse(initialStatus.content[0].text);
  assert.equal(initial.viewer.version, packageInfo.version);
  assert.equal(initial.viewer.distribution, 'packaged');
  assert.ok(initial.viewer.sourceRoot.startsWith(installed.installedPath + '/'));
  assert.equal(initial.counts.total, 0);
  assert.equal(existsSync(join(workspace, '.codex-teams')), false, 'Status discovery must not acquire owner');
  const models = await call('teams_models', { workspace });
  assert.ok(!models.isError, JSON.stringify(models.content));
  const catalog = JSON.parse(models.content[0].text);
  assert.ok(catalog.models.length > 0);
  assert.equal(catalog.confirmationRequired, true);
  assert.equal(catalog.captainSelectionSupported, true);
  assert.ok(mcp.tools.teams_start.inputSchema.properties.models);
  assert.ok(mcp.tools.teams_create.inputSchema.properties.model);
  assert.equal(existsSync(join(workspace, '.codex-teams')), false, 'Model discovery must not acquire owner');
  let formObserved = false;
  const receive = client.receive.bind(client);
  client.receive = frame => {
    if (frame.method !== 'mcpServer/elicitation/request') return receive(frame);
    assert.equal(frame.params.mode, 'form');
    assert.ok(frame.params.requestedSchema.properties.expert.enum.length > 0);
    assert.equal(frame.params.requestedSchema.properties.confirm.default, false);
    assert.equal(frame.params.requestedSchema.properties.remember.default, true);
    assert.ok(frame.params.requestedSchema.required.includes('remember'));
    formObserved = true;
    // Controlled protocol cancellation; never simulate human acceptance here.
    client.send({ id: frame.id, result: { action: 'cancel' } });
  };
  const declined = await call('teams_models', { workspace, confirm: true });
  assert.ok(!declined.isError, JSON.stringify(declined.content));
  const confirmationAction = JSON.parse(declined.content[0].text).status;
  assert.ok(['cancel', 'decline'].includes(confirmationAction), `Unexpected confirmation outcome: ${confirmationAction}`);
  assert.equal(formObserved, approvalPolicy === 'on-request');
  if (approvalPolicy === 'never') assert.equal(confirmationAction, 'decline');
  assert.equal(existsSync(join(workspace, '.codex-teams')), false, 'cancelled/declined confirmation must not acquire owner');
  const created = await call('teams_create', { expectedWorkspace: workspace, objective: 'Inspect isolated plugin installation', acceptance: ['Cite evidence'] });
  assert.ok(!created.isError, JSON.stringify(created.content));
  const task = JSON.parse(created.content[0].text);
  const unconfirmed = await call('teams_start', { workspace, taskId: task.id });
  assert.equal(unconfirmed.isError, true);
  assert.match(unconfirmed.content[0].text, /Host lifecycle binding missing/);
  const invalidCaptain = await call('teams_start', { workspace, taskId: task.id, models: { expert: { model: 'not-a-real-model-no-inference' } } });
  assert.equal(invalidCaptain.isError, true);
  assert.match(invalidCaptain.content[0].text, /Host lifecycle binding missing/);
  const activeInventory = await client.request('mcpServerStatus/list', { threadId: started.thread.id, limit: 100 });
  assert.equal(Object.keys(activeInventory.data.find(entry => entry.name === 'codex-agent-teams')?.tools ?? {}).length, 8);
  const status = await call('teams_status', { taskId: task.id });
  assert.equal(JSON.parse(status.content[0].text).status, 'pending');
  assert.match(status.content[1]?.text ?? '', /合同已创建；尚未启动成员/);
  const activeStatus = await call('teams_status', { workspace, overview: true });
  assert.ok(!activeStatus.isError);
  const active = JSON.parse(activeStatus.content[0].text);
  assert.equal(active.runtime.version, packageInfo.version);
  assert.equal(active.counts.pending, 1);
  assert.ok(active.runtime.sourceRoot.startsWith(installed.installedPath + '/'));
  const rejected = await call('teams_create', { expectedWorkspace: workspace, objective: 'Modify files', acceptance: ['Write'], mode: 'workspace-write' });
  assert.equal(rejected.isError, true);
  const cancelled = await call('teams_cancel', { taskId: task.id });
  assert.equal(JSON.parse(cancelled.content[0].text).status, 'cancelled');
  // Reuse the exact same cached installation and MCP connection for a second project.
  const secondInitial = await call('teams_status', { workspace: secondWorkspace, overview: true });
  assert.ok(!secondInitial.isError, JSON.stringify(secondInitial.content));
  assert.equal(JSON.parse(secondInitial.content[0].text).target.root, secondWorkspace);
  assert.equal(existsSync(join(secondWorkspace, '.codex-teams')), false);
  const secondModels = await call('teams_models', { workspace: secondWorkspace });
  assert.ok(!secondModels.isError, JSON.stringify(secondModels.content));
  assert.equal(JSON.parse(secondModels.content[0].text).workspace, secondWorkspace);
  assert.equal(JSON.parse(secondModels.content[0].text).confirmationRequired, true);
  const secondCreated = await call('teams_create', { expectedWorkspace: secondWorkspace, objective: 'Inspect another project with this installation', acceptance: ['Cite evidence'] });
  assert.ok(!secondCreated.isError, JSON.stringify(secondCreated.content));
  const secondTask = JSON.parse(secondCreated.content[0].text);
  const firstAgain = await call('teams_status', { taskId: task.id });
  assert.equal(JSON.parse(firstAgain.content[0].text).target.root, workspace);
  const secondById = await call('teams_status', { taskId: secondTask.id });
  assert.equal(JSON.parse(secondById.content[0].text).target.root, secondWorkspace);
  const wrongProject = await call('teams_cancel', { taskId: task.id, workspace: secondWorkspace });
  assert.equal(wrongProject.isError, true);
  const ambiguous = await call('teams_status', { overview: true });
  assert.equal(ambiguous.isError, true, 'multi-project overview never assumes last-used project');
  const secondCancelled = await call('teams_cancel', { taskId: secondTask.id });
  assert.equal(JSON.parse(secondCancelled.content[0].text).status, 'cancelled');
  assert.equal(existsSync(join(installed.installedPath, '.codex-teams')), false, 'no project state in cache');
  assert.ok(existsSync(join(workspace, '.codex-teams', 'state.sqlite')));
  result = { server, marketplace: marketplace.marketplaceName, installedInTemporaryHome: true,
    cachedPackageIndependent: true, cachedSkillDiscovered: true, inventoryWhileRuntimeActive: true, startupStatus: ready.status, tools: Object.keys(mcp.tools).sort(),
    statusBeforeOwner: true, observedPluginVersion: initial.viewer.version, observedRuntimeVersion: active.runtime.version,
    modelCatalogRead: true, outerApprovalPolicy: approvalPolicy, formRequestObserved: formObserved, rememberDefaultForwarded: formObserved, textReceiptForwarded: true, confirmationAction,
    declinedFormDoesNotAcquireOwner: true, captainDispatchSchemaAvailable: true, missingHostBindingBlocksStart: true,
    contractCreated: true, incompleteWriteContractRejected: true, taskCancelled: true, sameInstallationTwoProjects: true,
    perProjectState: true, wrongProjectRejected: true, ambiguousTargetRejected: true, cacheCwdRejected: true, inferenceStarted: false,
    userConfigChanged: false };
  result.pluginHookDefinitionsDiscovered = pluginDetails.plugin.hooks.map(hook => hook.eventName);
  result.pluginHooksInGlobalInventory = pluginHooks.length;
  result.hostHookExecutionVerified = false;
} catch (error) {
  let inventory;
  if (client && hostThread) {
    try {
      const response = await client.request('mcpServerStatus/list', { threadId: hostThread, limit: 100 });
      inventory = response.data.map(item => ({ name: item.name, toolCount: Object.keys(item.tools ?? {}).length }));
    } catch (diagnosticError) { inventory = { error: diagnosticError.message }; }
  }
  console.error(JSON.stringify({ smokeFailure: error.message, startupEvents, inventory, hostStderr: client?.stderr ?? '' }, null, 2));
  throw error;
} finally {
  cancelStartup?.();
  try {
    if (client) await client.stop();
    for (const targetWorkspace of [workspace, secondWorkspace]) {
      const path = join(targetWorkspace, '.codex-teams', 'state.sqlite');
      if (!existsSync(path)) continue;
      const db = new DatabaseSync(path, { readOnly: true });
      try {
        db.exec('PRAGMA busy_timeout=1000');
        const deadline = Date.now() + 3000;
        let alive;
        do {
          const row = db.prepare('SELECT value FROM meta WHERE key=?').get('owner');
          alive = row && processAlive(JSON.parse(row.value).pid);
          if (!alive) break;
          await delay(25);
        } while (Date.now() < deadline);
        assert.ok(!alive, 'Managed MCP runtime must exit before temporary workspace cleanup');
      } finally { db.close(); }
    }
    cleanupSafe = true;
  } finally {
    if (cleanupSafe) rmSync(root, { recursive: true, force: true });
    else console.error(`Temporary smoke artifacts retained because runtime exit is unconfirmed: ${root}`);
  }
}
console.log(JSON.stringify({ ...result, managedRuntimeExited: true }, null, 2));
