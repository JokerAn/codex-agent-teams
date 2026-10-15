import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { packNativePlugin, pluginTarget } from '../src/plugin-package.js';

const json = path => JSON.parse(readFileSync(path, 'utf8'));
const fixture = t => { const root = realpathSync(mkdtempSync(join(tmpdir(), 'teams-native-'))); t.after(() => rmSync(root, { recursive: true, force: true })); return root; };

test('default package contains only one native skill and metadata; relocation needs no local config or runtime', t => {
  const root = fixture(t), packed = packNativePlugin({ out: join(root, 'marketplace') });
  assert.equal(packed.mode, 'native'); assert.deepEqual(packed.runtimeDependencies, []);
  assert.deepEqual(readdirSync(packed.pluginRoot).sort(), ['.codex-plugin', 'build-info.json', 'package.json', 'skills']);
  assert.deepEqual(readdirSync(join(packed.pluginRoot, 'skills')), ['team']);
  const manifest = json(join(packed.pluginRoot, '.codex-plugin/plugin.json'));
  assert.equal(manifest.skills, './skills/'); assert.equal(manifest.hooks, undefined); assert.equal(manifest.mcpServers, undefined);
  const pkg = json(join(packed.pluginRoot, 'package.json'));
  assert.equal(pkg.dependencies, undefined); assert.equal(pkg.bin, undefined);
  const moved = join(root, 'moved'); cpSync(packed.marketplaceRoot, moved, { recursive: true }); rmSync(packed.marketplaceRoot, { recursive: true });
  const target = pluginTarget(moved); assert.equal(target.mode, 'native'); assert.equal(target.configPath, undefined);
  assert.deepEqual(readFileSync(join(target.pluginRoot, 'skills/team/SKILL.md')), readFileSync('skills/team/SKILL.md'));
  assert.equal(existsSync(join(root, '.codex-teams')), false);
});

test('native build succeeds from a dependency-free checkout with no Codex or npm executable', t => {
  const root = fixture(t);
  for (const file of ['scripts/build.js', 'scripts/codex-bin.js', 'src/cli.js', 'src/plugin-package.js', 'skills/team/SKILL.md', 'package.json', 'plugin.json', '.codex-plugin/plugin.json']) {
    mkdirSync(dirname(join(root, file)), { recursive: true }); cpSync(file, join(root, file));
  }
  const out = join(root, 'dist/native');
  const result = spawnSync(process.execPath, ['scripts/build.js', '--out', out], { cwd: root, encoding: 'utf8',
    env: { ...process.env, PATH: '', TEAMS_CONFIG: '/missing-unused-config', npm_execpath: '/missing-unused-npm' } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(json(join(out, 'plugins/codex-agent-teams/build-info.json')).mode, 'native');
  assert.equal(existsSync(join(root, 'node_modules')), false);
  assert.equal(existsSync(join(root, 'teams.local.json')), false);
  assert.equal(existsSync(join(root, '.codex-teams')), false);
  cpSync('src', join(root, 'src'), { recursive: true });
  const cliOut = join(root, 'dist/native-cli');
  const cli = spawnSync(process.execPath, ['src/cli.js', 'pack', '--out', cliOut], { cwd: root, encoding: 'utf8', env: { ...process.env, PATH: '' } });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).mode, 'native');
  assert.equal(existsSync(join(root, 'node_modules')), false);
});

test('native output preserves existing files and refuses recursive/symlinked source destinations', t => {
  const root = fixture(t), out = join(root, 'keep'); mkdirSync(out); writeFileSync(join(out, 'user'), 'untouched');
  assert.throws(() => packNativePlugin({ out }), /Output already exists/); assert.equal(readFileSync(join(out, 'user'), 'utf8'), 'untouched');
  const link = join(root, 'linked'); symlinkSync(resolve('skills'), link);
  assert.throws(() => packNativePlugin({ out: join(link, 'recursive') }), /cannot be inside skills/);
});
