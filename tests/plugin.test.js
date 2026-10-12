import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { loadConfig } from '../src/config.js';
import { packPlugin, pluginTarget } from '../src/plugin.js';

const json = path => JSON.parse(readFileSync(path, 'utf8'));
function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'teams-plugin-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const workspace = join(root, '工作区 with spaces');
  mkdirSync(workspace);
  const configPath = join(root, 'teams.local.json');
  writeFileSync(configPath, JSON.stringify({ workspace: './工作区 with spaces', profiles: { expert: { model: 'not-used-in-this-test' } } }));
  return { root, workspace, configPath, out: join(root, '插件 marketplace') };
}

test('configuration paths resolve from the config file, independent of launch cwd', t => {
  const { root, workspace, configPath } = fixture(t);
  const config = json(configPath);
  config.codexBin = './bin/codex';
  writeFileSync(configPath, JSON.stringify(config));
  const loaded = loadConfig(configPath);
  assert.equal(loaded.workspace, workspace);
  assert.equal(loaded.codexBin, join(root, 'bin/codex'));
});

test('prepared package includes production dependencies, supports cache relocation and serves real SDK MCP', async t => {
  const { root, workspace, configPath, out } = fixture(t);
  const packed = packPlugin({ configPath, out });
  assert.equal(packed.installed, false);
  assert.equal(packed.inferenceStarted, false);
  assert.deepEqual(packed.runtimeDependencies.sort(), ['node_modules/@modelcontextprotocol/core', 'node_modules/@modelcontextprotocol/server', 'node_modules/zod']);
  assert.equal(existsSync(join(packed.pluginRoot, 'node_modules/@modelcontextprotocol/client')), false);
  assert.equal(existsSync(join(packed.pluginRoot, 'tests')), false);
  assert.equal(existsSync(join(packed.pluginRoot, 'teams.local.json')), false);
  assert.equal(json(packed.configPath).workspace, workspace);
  const moved = join(root, '缓存 copy');
  renameSync(out, moved);
  const target = pluginTarget(moved);
  const manifest = json(join(target.pluginRoot, 'mcp.json'));
  const server = manifest.mcpServers['codex-agent-teams'];
  const transport = new StdioClientTransport({ command: server.command, args: server.args, cwd: target.pluginRoot, env: { ...process.env, ...server.env }, stderr: 'pipe' });
  const client = new Client({ name: 'packaged-plugin-tests', version: '0.1.0' });
  t.after(async () => { await client.close(); });
  try {
    await client.connect(transport);
    assert.equal((await client.listTools()).tools.length, 7);
    const created = await client.callTool({ name: 'teams_create', arguments: { objective: 'Inspect relocated package', acceptance: ['Cite source'] } });
    assert.ok(!created.isError);
    const task = JSON.parse(created.content[0].text);
    const status = await client.callTool({ name: 'teams_status', arguments: { taskId: task.id } });
    assert.equal(JSON.parse(status.content[0].text).status, 'pending');
    const rejected = await client.callTool({ name: 'teams_create', arguments: { objective: 'Write source', acceptance: ['Write'], mode: 'workspace-write' } });
    assert.equal(rejected.isError, true);
    const cancelled = await client.callTool({ name: 'teams_cancel', arguments: { taskId: task.id } });
    assert.equal(JSON.parse(cancelled.content[0].text).status, 'cancelled');
    assert.ok(existsSync(join(workspace, '.codex-teams', 'state.sqlite')));
    assert.equal(existsSync(join(target.pluginRoot, '.codex-teams')), false);
  } finally { await client.close(); }
});

test('pack refuses existing output without overwriting it', t => {
  const { configPath, out } = fixture(t);
  mkdirSync(out);
  const marker = join(out, 'keep.txt');
  writeFileSync(marker, 'keep');
  assert.throws(() => packPlugin({ configPath, out }), /Output already exists/);
  assert.equal(readFileSync(marker, 'utf8'), 'keep');
});

test('pack refuses recursive copy targets including symlinked parents', t => {
  const { root, configPath } = fixture(t);
  const link = join(root, 'source-link');
  symlinkSync(resolve('src'), link);
  assert.throws(() => packPlugin({ configPath, out: join(link, 'recursive-package') }), /cannot be inside src/);
  assert.equal(existsSync(resolve('src/recursive-package')), false);
});

test('prepared marketplace rejects symlink escape', t => {
  const { root, configPath, out } = fixture(t);
  const packed = packPlugin({ configPath, out });
  const escape = join(root, 'outside-plugin');
  renameSync(packed.pluginRoot, escape);
  symlinkSync(escape, packed.pluginRoot);
  assert.throws(() => pluginTarget(out), /escapes marketplace root/);
});

test('CLI doctor uses supplied configuration and reports invalid profiles without a turn', t => {
  const { root, configPath } = fixture(t);
  const binary = join(root, 'fake codex');
  writeFileSync(binary, `#!/usr/bin/env node\nprocess.argv[2] = 'normal';\nawait import(${JSON.stringify(new URL('./fixtures/fake-app-server.js', import.meta.url).href)});\n`, { mode: 0o755 });
  const config = json(configPath);
  config.codexBin = binary;
  config.profiles.expert = { model: 'test-model', effort: 'high' };
  writeFileSync(configPath, JSON.stringify(config));
  const output = execFileSync(process.execPath, [resolve('src/cli.js'), 'doctor', '--config', configPath, '--check-thread'], { encoding: 'utf8', timeout: 5000 });
  const result = JSON.parse(output);
  assert.equal(result.server.userAgent, 'fake-test-server');
  assert.equal(result.threadCheck.model, 'test-model');
  assert.equal(result.inferenceStarted, false);
  config.profiles.expert.model = 'missing-model';
  writeFileSync(configPath, JSON.stringify(config));
  assert.throws(() => execFileSync(process.execPath, [resolve('src/cli.js'), 'doctor', '--config', configPath], { encoding: 'utf8', timeout: 5000, stdio: 'pipe' }), error => {
    assert.equal(error.status, 1);
    assert.match(error.stderr, /Configured expert model is unavailable/);
    assert.equal(error.stdout, '');
    return true;
  });
});
