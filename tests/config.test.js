import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { loadConfig, configForWorkspace } from '../src/config.js';

test('global config needs no project, CLI selects its cwd or override, and old fixed configs stay fixed', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'teams-global-config-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const a = join(root, 'project A'), b = join(root, 'project B');
  mkdirSync(a); mkdirSync(b);
  const file = join(root, 'config.json');
  writeFileSync(file, JSON.stringify({ profiles: { expert: { model: 'not-used' } } }));
  const global = loadConfig(file);
  assert.equal('workspace' in global, false);
  assert.equal(configForWorkspace(global).workspace, realpathSync(process.cwd()));
  assert.equal(configForWorkspace(global, a).workspace, a);
  assert.equal(configForWorkspace(global, b).workspace, b);
  assert.throws(() => configForWorkspace(global, 'project A'), /absolute path/);
  writeFileSync(file, JSON.stringify({ ...global, workspace: './project A' }));
  const fixed = loadConfig(file);
  assert.equal(configForWorkspace(fixed).workspace, a);
  assert.throws(() => configForWorkspace(fixed, b), /Target workspace mismatch/);
  // A stale project in an old build config must not bind or prevent a new global package.
  writeFileSync(file, JSON.stringify({ ...global, workspace: './deleted-project' }));
  assert.equal('workspace' in loadConfig(file, { global: true }), false);
  assert.throws(() => loadConfig(file), /ENOENT/);
});

test('the same global config observes either CLI cwd without creating a workspace owner', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'teams-global-cli-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const a = join(root, 'A'), b = join(root, 'B');
  mkdirSync(a); mkdirSync(b);
  const file = join(root, 'config.json');
  writeFileSync(file, JSON.stringify({ profiles: { expert: { model: 'not-used' } } }));
  const cli = new URL('../src/cli.js', import.meta.url).pathname;
  for (const cwd of [a, b]) {
    const value = JSON.parse(execFileSync(process.execPath, [cli, 'status', '--config', file, '--overview'], { cwd, encoding: 'utf8', stdio: 'pipe' }));
    assert.equal(value.target.root, cwd);
    assert.equal(value.stateExists, false);
    assert.equal(value.runtime, null);
  }
  const value = JSON.parse(execFileSync(process.execPath, [cli, 'status', '--config', file, '--overview', '--workspace', b], { cwd: a, encoding: 'utf8', stdio: 'pipe' }));
  assert.equal(value.target.root, b);
});
