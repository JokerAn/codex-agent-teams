import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
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
  writeFileSync(configPath, JSON.stringify({ workspace: './工作区 with spaces', codexBin: process.execPath, profiles: { expert: { model: 'not-used-in-this-test' } } }));
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

test('build binary override is captured in the package without rewriting user config', t => {
  const { configPath, out } = fixture(t), before = readFileSync(configPath);
  const packed = packPlugin({ configPath, out, codexBin: process.execPath });
  assert.equal(json(packed.configPath).codexBin, process.execPath);
  assert.equal('workspace' in json(packed.configPath), false);
  assert.deepEqual(readFileSync(configPath), before);
  assert.throws(() => packPlugin({ configPath, out: out + '-invalid', codexBin: 'codex' }), /absolute path/);
});

test('packaging rejects unsupported platforms before reading config or creating output', () => {
  const result = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { packPlugin } from './src/plugin.js';
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try { packPlugin({ configPath: '/missing/config.json' }); }
    catch (error) { console.log(error.message); }
  `], { encoding: 'utf8' });
  assert.match(result, /macOS\/Linux only.*Windows/);
});

test('pack rejects a missing Codex executable before creating an output directory', t => {
  const { configPath, out } = fixture(t);
  assert.throws(() => packPlugin({ configPath, out, codexBin: '/missing-packaged-codex/codex' }), /Codex executable unavailable/);
  assert.equal(existsSync(out), false);
});

test('package inherits host tools without saving builder PATH and uses exact Node for env shebangs', t => {
  const { root, workspace, configPath, out } = fixture(t);
  const bin = join(root, 'host tools'), binary = join(bin, 'codex'), evidence = join(root, 'evidence.json');
  mkdirSync(bin);
  writeFileSync(join(bin, 'custom-validator'), '#!/usr/bin/env node\nconsole.log("host-custom-tool");\n', { mode: 0o755 });
  const config = json(configPath);
  config.codexBin = 'codex';
  config.profiles.expert = { model: 'test-model', effort: 'high' };
  writeFileSync(configPath, JSON.stringify(config));
  // This controlled App Server also exercises packaged preflight + the real
  // verification spawn, before serving the existing protocol fixture. No inference.
  writeFileSync(binary, `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
const { inspectExecution } = await import(${JSON.stringify(pathToFileURL(join(out, 'plugins/codex-agent-teams/src/preflight.js')).href)});
const { runVerification } = await import(${JSON.stringify(pathToFileURL(join(out, 'plugins/codex-agent-teams/src/verification.js')).href)});
const spec = { command: 'custom-validator', args: [], timeoutMs: 5000 };
const preflight = inspectExecution({ verification: spec }, ${JSON.stringify(workspace)});
const check = await runVerification(spec, { cwd: ${JSON.stringify(workspace)}, logDir: ${JSON.stringify(join(root, 'logs'))} });
writeFileSync(${JSON.stringify(evidence)}, JSON.stringify({ executable: preflight.executable, status: check.status, path: process.env.PATH }));
process.argv[2] = 'normal';
await import(${JSON.stringify(new URL('./fixtures/fake-app-server.js', import.meta.url).href)});
`, { mode: 0o755 });
  const before = process.env.PATH;
  let packed;
  try {
    process.env.PATH = `${bin}:/private/tmp/builder-username-sensitive`;
    packed = packPlugin({ configPath, out });
  } finally { process.env.PATH = before; }
  assert.equal(json(packed.configPath).codexBin, realpathSync(binary));
  const server = json(join(packed.pluginRoot, 'mcp.json')).mcpServers['codex-agent-teams'];
  assert.equal(server.command, './mcp-launch');
  assert.ok(statSync(join(packed.pluginRoot, server.command)).mode & 0o111);
  assert.equal(server.env, undefined);
  const { type, ...legacyServer } = server;
  assert.equal(type, 'stdio');
  assert.deepEqual(json(join(packed.pluginRoot, '.mcp.json')).mcpServers['codex-agent-teams'], { ...legacyServer, command: process.execPath, args: ['mcp-launch.js', ...server.args] });
  for (const path of ['mcp.json', '.mcp.json', 'mcp-launch.js', 'mcp-launch']) assert.doesNotMatch(readFileSync(join(packed.pluginRoot, path), 'utf8'), /builder-username-sensitive/);
  const output = execFileSync(server.command, ['doctor', '--config', 'teams.config.json'], {
    cwd: packed.pluginRoot, env: { ...process.env, PATH: bin }, encoding: 'utf8', timeout: 15000,
  });
  assert.equal(JSON.parse(output).inferenceStarted, false);
  const result = json(evidence);
  assert.equal(result.executable, realpathSync(join(bin, 'custom-validator')));
  assert.equal(result.status, 'passed');
  assert.equal(result.path, `${dirname(process.execPath)}:${bin}`);
  assert.match(readFileSync(join(root, 'logs/stdout.log'), 'utf8'), /host-custom-tool/);
});

test('POSIX launcher safely quotes a Node path containing spaces and a single quote', t => {
  const { root, configPath, out } = fixture(t);
  const runtime = join(root, "Node runtime's directory", 'node');
  mkdirSync(dirname(runtime));
  symlinkSync(process.execPath, runtime);
  const builder = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { packPlugin } from './src/plugin.js';
    Object.defineProperty(process, 'execPath', { value: ${JSON.stringify(runtime)} });
    console.log(JSON.stringify(packPlugin({ configPath: ${JSON.stringify(configPath)}, out: ${JSON.stringify(out)} })));
  `], { encoding: 'utf8' });
  const packed = JSON.parse(builder);
  const result = execFileSync('./mcp-launch', ['--help'], {
    cwd: packed.pluginRoot, env: { ...process.env, PATH: '' }, encoding: 'utf8', timeout: 10000,
  });
  assert.match(result, /Codex Agent Teams.*accuracy and completion efficiency first/);
});

test('prepared package includes production dependencies, supports cache relocation and serves real SDK MCP', async t => {
  const { root, workspace, configPath, out } = fixture(t);
  const packed = packPlugin({ configPath, out });
  assert.equal(packed.installed, false);
  const build = json(join(packed.pluginRoot, 'build-info.json'));
  assert.equal(build.version, json(resolve('package.json')).version);
  assert.match(build.sourceDigest, /^[a-f0-9]{64}$/);
  assert.equal(packed.inferenceStarted, false);
  const manifest = json(resolve('plugin.json'));
  const compatibility = json(join(packed.pluginRoot, '.codex-plugin/plugin.json'));
  assert.equal(existsSync(join(packed.pluginRoot, 'plugin.json')), false, 'portable manifest must not shadow hooks on this Codex alpha');
  assert.equal(packed.manifestFormat, 'codex-compatibility');
  for (const field of ['name', 'version', 'description']) assert.equal(manifest[field], compatibility[field]);
  assert.equal(manifest.skills, undefined); // Agent Plugins v1 uses ./skills and ./mcp.json defaults.
  assert.equal(manifest.mcpServers, undefined);
  assert.equal(compatibility.skills, './skills/');
  assert.equal(compatibility.mcpServers, './.mcp.json');
  const hooks = json(join(packed.pluginRoot, 'hooks/hooks.json')).hooks;
  assert.deepEqual(Object.keys(hooks).sort(), ['Interrupt', 'PreToolUse', 'SessionEnd']);
  assert.match(hooks.PreToolUse[0].hooks[0].command, /\$PLUGIN_ROOT\/src\/host-hook\.js/);
  assert.equal(hooks.Interrupt[0].hooks[0].timeout, 3);
  assert.deepEqual(packed.runtimeDependencies.sort(), ['node_modules/@modelcontextprotocol/core', 'node_modules/@modelcontextprotocol/server', 'node_modules/zod']);
  assert.equal(existsSync(join(packed.pluginRoot, 'node_modules/@modelcontextprotocol/client')), false);
  assert.equal(existsSync(join(packed.pluginRoot, 'tests')), false);
  assert.equal(existsSync(join(packed.pluginRoot, 'teams.local.json')), false);
  assert.equal('workspace' in json(packed.configPath), false);
  const moved = join(root, '缓存 copy');
  renameSync(out, moved);
  const target = pluginTarget(moved);
  const server = json(join(target.pluginRoot, 'mcp.json')).mcpServers['codex-agent-teams'];
  assert(server.args.includes('--host-lifecycle'));
  const transport = new StdioClientTransport({ command: server.command, args: server.args, cwd: target.pluginRoot, env: { ...process.env, ...server.env }, stderr: 'pipe' });
  const client = new Client({ name: 'packaged-plugin-tests', version: '0.1.0' });
  t.after(async () => { await client.close(); });
  try {
    await client.connect(transport);
    assert.equal(client.getServerVersion().version, json(resolve('package.json')).version);
    const missingTarget = await client.callTool({ name: 'teams_status', arguments: { overview: true } });
    assert.equal(missingTarget.isError, true, 'plugin cache cwd is never a project fallback');
    const overview = await client.callTool({ name: 'teams_status', arguments: { workspace, overview: true } });
    const identity = JSON.parse(overview.content[0].text).viewer;
    assert.equal(identity.distribution, 'packaged');
    assert.equal(identity.build.sourceDigest, build.sourceDigest);
    assert.equal(identity.sourceRoot.replace(/\/$/, ''), target.pluginRoot);
    assert.equal((await client.listTools()).tools.length, 8);
    const created = await client.callTool({ name: 'teams_create', arguments: { expectedWorkspace: workspace, objective: 'Inspect relocated package', acceptance: ['Cite source'] } });
    assert.ok(!created.isError);
    const task = JSON.parse(created.content[0].text);
    const otherProject = join(root, '第二个项目');
    mkdirSync(otherProject);
    const second = await client.callTool({ name: 'teams_create', arguments: { expectedWorkspace: otherProject, objective: 'Inspect another project with the same installation', acceptance: ['Cite source'] } });
    assert.ok(!second.isError, JSON.stringify(second.content));
    const secondTask = JSON.parse(second.content[0].text);
    assert.equal(secondTask.target.root, otherProject);
    const wrongProject = await client.callTool({ name: 'teams_cancel', arguments: { workspace: otherProject, taskId: task.id } });
    assert.equal(wrongProject.isError, true);
    const status = await client.callTool({ name: 'teams_status', arguments: { taskId: task.id } });
    assert.equal(JSON.parse(status.content[0].text).status, 'pending');
    const secondStatus = await client.callTool({ name: 'teams_status', arguments: { taskId: secondTask.id } });
    assert.equal(JSON.parse(secondStatus.content[0].text).target.root, otherProject);
    const ambiguous = await client.callTool({ name: 'teams_status', arguments: { overview: true } });
    assert.equal(ambiguous.isError, true, 'multi-project status requires an explicit project from the captain');
    const rejected = await client.callTool({ name: 'teams_create', arguments: { expectedWorkspace: workspace, objective: 'Write source', acceptance: ['Write'], mode: 'workspace-write' } });
    assert.equal(rejected.isError, true);
    const cancelled = await client.callTool({ name: 'teams_cancel', arguments: { taskId: task.id } });
    assert.equal(JSON.parse(cancelled.content[0].text).status, 'cancelled');
    assert.equal(Boolean((await client.callTool({ name: 'teams_cancel', arguments: { taskId: secondTask.id } })).isError), false);
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
