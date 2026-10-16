import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { packNativePlugin, pluginTarget } from '../src/plugin-package.js';

const json = path => JSON.parse(readFileSync(path, 'utf8'));
const fixture = t => { const root = realpathSync(mkdtempSync(join(tmpdir(), 'teams-native-'))); t.after(() => rmSync(root, { recursive: true, force: true })); return root; };
const sourceFixture = root => {
  const source = join(root, 'source');
  for (const file of ['src/plugin-package.js', 'skills/team/SKILL.md', 'package.json', 'plugin.json', '.codex-plugin/plugin.json']) {
    mkdirSync(dirname(join(source, file)), { recursive: true }); cpSync(file, join(source, file));
  }
  return source;
};

test('native packaging rejects missing or invalid release versions before creating output', async t => {
  for (const version of [undefined, null, '', 'not-a-version', '01.2.3', '1.2.3-01', '1.2.3\n']) {
    const root = fixture(t), source = sourceFixture(root);
    for (const file of ['package.json', 'plugin.json', '.codex-plugin/plugin.json']) {
      const manifest = json(join(source, file));
      if (version === undefined) { delete manifest.version; } else { manifest.version = version; }
      writeFileSync(join(source, file), JSON.stringify(manifest));
    }
    const { packNativePlugin: pack } = await import(pathToFileURL(join(source, 'src/plugin-package.js')));
    const out = join(root, 'output/marketplace');
    assert.throws(() => pack({ out }), /Native plugin metadata.*version/, `version=${version}`);
    assert.equal(existsSync(dirname(out)), false);
  }
});

test('native packaging requires nonempty package and plugin metadata', async t => {
  for (const field of ['package name', 'package description', 'plugin description']) {
    const root = fixture(t), source = sourceFixture(root);
    const files = field === 'plugin description' ? ['plugin.json', '.codex-plugin/plugin.json'] : ['package.json'];
    const key = field === 'package name' ? 'name' : 'description';
    for (const file of files) {
      writeFileSync(join(source, file), JSON.stringify({ ...json(join(source, file)), [key]: '  ' }));
    }
    const { packNativePlugin: pack } = await import(pathToFileURL(join(source, 'src/plugin-package.js')));
    const out = join(root, 'output/marketplace');
    assert.throws(() => pack({ out }), /Native plugin metadata/, field);
    assert.equal(existsSync(dirname(out)), false);
  }
});

test('native packaging rejects additional manifest resources and unknown fields', async t => {
  for (const [key, value] of [['apps', './apps.json'], ['agents', '/private/build-machine/agents'], ['extensions', { 'com.openai': { apps: './apps.json' } }]]) {
    const root = fixture(t), source = sourceFixture(root);
    const manifest = join(source, '.codex-plugin/plugin.json');
    writeFileSync(manifest, JSON.stringify({ ...json(manifest), [key]: value }));
    const { packNativePlugin: pack } = await import(pathToFileURL(join(source, 'src/plugin-package.js')));
    const out = join(root, 'output/marketplace');
    assert.throws(() => pack({ out }), /Native plugin manifest.*unsupported/, key);
    assert.equal(existsSync(dirname(out)), false);
  }
});

test('native packaging accepts a release with prerelease and build identifiers', async t => {
  const root = fixture(t), source = sourceFixture(root), version = '1.2.3-rc.1+build.4';
  for (const file of ['package.json', 'plugin.json', '.codex-plugin/plugin.json']) {
    writeFileSync(join(source, file), JSON.stringify({ ...json(join(source, file)), version }));
  }
  const { packNativePlugin: pack } = await import(pathToFileURL(join(source, 'src/plugin-package.js')));
  const packed = pack({ out: join(root, 'marketplace') });
  assert.equal(json(join(packed.pluginRoot, 'build-info.json')).version, version);
});

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
  assert.equal(lstatSync(join(target.pluginRoot, 'skills/team/SKILL.md')).isFile(), true);
  assert.equal(existsSync(join(root, '.codex-teams')), false);
});

for (const linkedPath of ['skills', 'skills/team', 'skills/team/SKILL.md']) {
  test(`native packaging rejects a linked source path before creating output: ${linkedPath}`, async t => {
    const root = fixture(t), source = sourceFixture(root);
    const linked = join(source, linkedPath), external = join(root, 'external');
    cpSync(linked, external, { recursive: true }); rmSync(linked, { recursive: true }); symlinkSync(external, linked);
    const { packNativePlugin: pack } = await import(pathToFileURL(join(source, 'src/plugin-package.js')));
    const out = join(root, 'output/marketplace');
    assert.throws(() => pack({ out }), /Native skill source.*symbolic link/);
    assert.equal(existsSync(dirname(out)), false, 'reject before creating any output directories');
    assert.equal(existsSync(external), true, 'the source target is preserved');
    rmSync(external, { recursive: true });
    assert.throws(() => pack({ out }), /Native skill source.*symbolic link/);
  });
}

test('native package remains readable after removing its source checkout', async t => {
  const root = fixture(t), source = sourceFixture(root);
  const expected = readFileSync(join(source, 'skills/team/SKILL.md'));
  const { packNativePlugin: pack } = await import(pathToFileURL(join(source, 'src/plugin-package.js')));
  const packed = pack({ out: join(root, 'marketplace') });
  rmSync(source, { recursive: true });
  const skill = join(pluginTarget(packed.marketplaceRoot).pluginRoot, 'skills/team/SKILL.md');
  assert.equal(lstatSync(skill).isSymbolicLink(), false);
  assert.deepEqual(readFileSync(skill), expected);
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
