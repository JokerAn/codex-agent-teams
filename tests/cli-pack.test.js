import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../', import.meta.url));
const cli = join(source, 'src/cli.js');
const json = path => JSON.parse(readFileSync(path, 'utf8'));

function fixture(t, binary) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'teams-cli-pack-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const configPath = join(root, 'settings', 'teams.json');
  mkdirSync(dirname(configPath));
  writeFileSync(configPath, JSON.stringify({ codexBin: binary ?? './missing-codex', profiles: { expert: { model: 'unused-test-model' } } }, null, 2) + '\n');
  return { root, configPath, out: join(root, 'output', 'marketplace') };
}

function pack({ root, configPath, out }, args = [], env = {}) {
  return spawnSync(process.execPath, [cli, 'pack', '--strict', '--config', configPath, '--out', out, ...args], {
    cwd: root, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 30000,
  });
}

for (const kind of ['absolute', 'relative with spaces', 'PATH command']) {
  test(`strict CLI honors explicit ${kind} binary without rewriting config`, t => {
    const setup = fixture(t);
    const before = readFileSync(setup.configPath);
    const binDir = join(setup.root, 'host tools');
    mkdirSync(binDir);
    const binary = join(binDir, 'test-codex');
    // A controlled executable identity only: packaging must never launch it.
    const marker = join(setup.root, 'binary-executed');
    writeFileSync(binary, `#!/bin/sh\nprintf executed > '${marker.replaceAll("'", "'\\''")}'\nexit 99\n`, { mode: 0o755 });
    const argument = kind === 'absolute' ? binary : kind === 'relative with spaces' ? './host tools/test-codex' : 'test-codex';
    const result = pack(setup, ['--binary', argument], { PATH: binDir });
    assert.equal(result.status, 0, result.stderr);
    const packed = JSON.parse(result.stdout);
    assert.equal(packed.mode, 'strict');
    assert.equal(packed.inferenceStarted, false);
    assert.equal(json(packed.configPath).codexBin, realpathSync(binary));
    assert.deepEqual(readFileSync(setup.configPath), before);
    assert.equal(existsSync(marker), false);
  });
}

test('strict CLI rejects an explicit missing binary instead of using valid config', t => {
  const setup = fixture(t, process.execPath);
  const before = readFileSync(setup.configPath);
  const result = pack(setup, ['--binary', './missing override/codex']);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /找不到可执行的 Codex CLI/);
  assert.equal(result.stdout, '');
  assert.equal(existsSync(dirname(setup.out)), false);
  assert.deepEqual(readFileSync(setup.configPath), before);
});

test('strict CLI preserves configured binary when no override is supplied', t => {
  const setup = fixture(t, process.execPath);
  const before = readFileSync(setup.configPath);
  const result = pack(setup, [], { PATH: '' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(json(JSON.parse(result.stdout).configPath).codexBin, realpathSync(process.execPath));
  assert.deepEqual(readFileSync(setup.configPath), before);
});

test('CLI help and native pack need neither strict dependencies nor binary resolver', t => {
  const { root, out } = fixture(t);
  for (const file of ['src/cli.js', 'src/plugin-package.js', 'skills/team/SKILL.md', 'package.json', 'plugin.json', '.codex-plugin/plugin.json']) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    cpSync(join(source, file), join(root, file));
  }
  const options = { cwd: root, env: { ...process.env, PATH: '', TEAMS_CONFIG: '/missing-config' }, encoding: 'utf8', timeout: 10000 };
  const help = spawnSync(process.execPath, ['src/cli.js', '--help'], options);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Codex Agent Teams/);
  const native = spawnSync(process.execPath, ['src/cli.js', 'pack', '--out', out], options);
  assert.equal(native.status, 0, native.stderr);
  assert.equal(JSON.parse(native.stdout).mode, 'native');
});

test('CLI rejects unknown commands before loading strict dependencies', t => {
  const { root } = fixture(t);
  cpSync(join(source, 'src'), join(root, 'src'), { recursive: true });
  cpSync(join(source, 'package.json'), join(root, 'package.json'));
  assert.equal(existsSync(join(root, 'node_modules')), false);
  const result = spawnSync(process.execPath, ['src/cli.js', 'typo'], {
    cwd: root, env: { ...process.env, PATH: '' }, encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr.trim(), 'Unknown command: typo');
});
