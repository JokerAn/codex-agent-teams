// Explicit no-inference host check. Uses only a temporary Codex home.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { AppServerClient } from '../src/app-server.js';
import { packNativePlugin } from '../src/plugin-package.js';
import { resolveCodexBin } from './codex-bin.js';

const { values } = parseArgs({ options: { binary: { type: 'string', default: 'codex' } } });
const binary = resolveCodexBin(values.binary), root = realpathSync(mkdtempSync(join(tmpdir(), 'teams-native-smoke-')));
const home = join(root, 'home'), workspace = join(root, 'workspace'); mkdirSync(home); mkdirSync(workspace);
const env = { ...process.env, CODEX_HOME: home, CODEX_TEAMS_MEMBER: '0' };
let client;
try {
  const packed = packNativePlugin({ out: join(root, 'marketplace') });
  const command = args => JSON.parse(execFileSync(binary, args, { env, encoding: 'utf8', stdio: 'pipe', timeout: 15000 }));
  command(['plugin', 'marketplace', 'add', packed.marketplaceRoot, '--json']);
  const installed = command(['plugin', 'add', 'codex-agent-teams@codex-agent-teams-local', '--json']);
  assert(installed.installedPath.startsWith(home + '/'));
  assert.deepEqual(readFileSync(join(installed.installedPath, 'skills/team/SKILL.md')), readFileSync('skills/team/SKILL.md'));
  rmSync(packed.marketplaceRoot, { recursive: true, force: true });
  client = new AppServerClient({ binary, cwd: workspace, env, args: ['app-server', '--stdio', '-c', 'features.plugins=true', '-c', 'features.hooks=true'] });
  await client.initialize(undefined, { experimentalApi: true });
  const thread = await client.request('thread/start', { cwd: workspace, sandbox: 'read-only', approvalPolicy: 'never', ephemeral: true, config: { 'features.plugins': true } });
  const skills = await client.request('skills/list', { cwds: [workspace], forceReload: true });
  const found = skills.data.flatMap(entry => entry.skills ?? []).find(skill => skill.name === 'codex-agent-teams:team');
  assert(found?.path.startsWith(installed.installedPath + '/'), 'installed native skill must be discoverable without source package');
  const servers = await client.request('mcpServerStatus/list', { threadId: thread.thread.id, limit: 100 });
  assert(!servers.data.some(server => server.name === 'codex-agent-teams'));
  const hooks = await client.request('hooks/list', { cwds: [workspace] });
  const pluginHooks = hooks.data.flatMap(entry => entry.hooks).filter(hook => hook.source === 'plugin' && hook.sourcePath.startsWith(installed.installedPath + '/'));
  assert.equal(pluginHooks.length, 0);
  for (const file of ['src', 'node_modules', 'teams.config.json', '.mcp.json', 'mcp.json', 'hooks', 'skills/strict-delivery']) assert(!existsSync(join(installed.installedPath, file)), file);
  assert(!existsSync(join(workspace, '.codex-teams')));
  let bytes = 0, files = 0;
  const count = path => { for (const item of readdirSync(path, { withFileTypes: true })) { const child = join(path, item.name); if (item.isDirectory()) count(child); else { bytes += statSync(child).size; files++; } } };
  count(installed.installedPath);
  await client.stop();
  console.log(JSON.stringify({ version: installed.version, mode: 'native', cachedSkillDiscovered: true, sourceRemoved: true, externalMcpServers: 0,
    pluginHooks: 0, projectStateCreated: false, packageFiles: files, packageBytes: bytes, inferenceStarted: false, userConfigChanged: false, appServerExited: true }, null, 2));
} finally { try { await client?.stop(); } finally { rmSync(root, { recursive: true, force: true }); } }
