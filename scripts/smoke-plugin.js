import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { processAlive } from '../src/store.js';
import { AppServerClient } from '../src/app-server.js';
import { packPlugin } from '../src/plugin.js';

// Explicit host integration check: no inference, no real user-home installation.
const { values } = parseArgs({ options: { binary: { type: 'string', default: 'codex' } } });
const root = realpathSync(mkdtempSync(join(tmpdir(), 'teams-plugin-smoke-')));
const home = join(root, 'codex-home');
const workspace = join(root, 'workspace');
mkdirSync(home); mkdirSync(workspace);
const configPath = join(root, 'teams.config.json');
writeFileSync(configPath, JSON.stringify({ workspace, profiles: { expert: { model: 'not-used-no-inference' } } }));
let client, cancelStartup, result;
try {
  const packed = packPlugin({ configPath, out: join(root, 'marketplace') });
  const env = { ...process.env, CODEX_HOME: home, CODEX_TEAMS_MEMBER: '0' };
  const command = args => JSON.parse(execFileSync(values.binary, args, { env, encoding: 'utf8', stdio: 'pipe', timeout: 15000 }));
  const marketplace = command(['plugin', 'marketplace', 'add', packed.marketplaceRoot, '--json']);
  const installed = command(['plugin', 'add', 'codex-agent-teams@codex-agent-teams-local', '--json']);
  assert.ok(installed.installedPath.startsWith(home + '/'));
  // Test the host cache, not the source marketplace directory.
  rmSync(packed.pluginRoot, { recursive: true });
  client = new AppServerClient({ binary: values.binary, cwd: workspace, env });
  const server = await client.initialize(undefined, { experimentalApi: true });
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
  const started = await client.request('thread/start', { cwd: workspace, sandbox: 'read-only', approvalPolicy: 'never', ephemeral: true, config: { 'features.plugins': true } });
  const ready = await startup;
  const skills = await client.request('skills/list', { cwds: [workspace], forceReload: true });
  const team = skills.data.flatMap(entry => entry.skills ?? []).find(skill => skill.name === 'codex-agent-teams:team');
  assert.ok(team && team.path.startsWith(installed.installedPath + '/') && existsSync(team.path), 'Cached skill must be discoverable from installed plugin');
  assert.equal(ready.threadId, started.thread.id);
  const inventory = await client.request('mcpServerStatus/list', { threadId: started.thread.id, limit: 100 });
  const mcp = inventory.data.find(entry => entry.name === 'codex-agent-teams');
  assert.deepEqual(Object.keys(mcp?.tools ?? {}).sort(), ['teams_cancel', 'teams_create', 'teams_integrate', 'teams_review', 'teams_start', 'teams_status', 'teams_wait']);
  const call = (tool, args) => client.request('mcpServer/tool/call', { threadId: started.thread.id, server: 'codex-agent-teams', tool, arguments: args });
  const created = await call('teams_create', { objective: 'Inspect isolated plugin installation', acceptance: ['Cite evidence'] });
  assert.ok(!created.isError, JSON.stringify(created.content));
  const task = JSON.parse(created.content[0].text);
  const activeInventory = await client.request('mcpServerStatus/list', { threadId: started.thread.id, limit: 100 });
  assert.equal(Object.keys(activeInventory.data.find(entry => entry.name === 'codex-agent-teams')?.tools ?? {}).length, 7);
  const status = await call('teams_status', { taskId: task.id });
  assert.equal(JSON.parse(status.content[0].text).status, 'pending');
  const rejected = await call('teams_create', { objective: 'Modify files', acceptance: ['Write'], mode: 'workspace-write' });
  assert.equal(rejected.isError, true);
  const cancelled = await call('teams_cancel', { taskId: task.id });
  assert.equal(JSON.parse(cancelled.content[0].text).status, 'cancelled');
  assert.ok(existsSync(join(workspace, '.codex-teams', 'state.sqlite')));
  result = { server, marketplace: marketplace.marketplaceName, installedInTemporaryHome: true,
    cachedPackageIndependent: true, cachedSkillDiscovered: true, inventoryWhileRuntimeActive: true, startupStatus: ready.status, tools: Object.keys(mcp.tools).sort(),
    contractCreated: true, incompleteWriteContractRejected: true, taskCancelled: true, inferenceStarted: false,
    userConfigChanged: false };
} finally {
  cancelStartup?.();
  try {
    if (client) await client.stop();
    const path = join(workspace, '.codex-teams', 'state.sqlite');
    if (existsSync(path)) {
      const db = new DatabaseSync(path, { readOnly: true });
      try {
        const deadline = Date.now() + 2000;
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
  } finally { rmSync(root, { recursive: true, force: true }); }
}
console.log(JSON.stringify({ ...result, managedRuntimeExited: true }, null, 2));
