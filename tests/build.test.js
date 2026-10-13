import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveCodexBin } from '../scripts/codex-bin.js';

test('binary discovery prefers PATH, falls back to desktop and respects explicit paths', t => {
  const root = mkdtempSync(join(tmpdir(), 'teams-build-path-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, 'bin'), desktop = join(root, 'Desktop app', 'codex');
  mkdirSync(bin); mkdirSync(join(root, 'Desktop app'));
  writeFileSync(join(bin, 'codex'), '#!/bin/sh\n', { mode: 0o755 });
  writeFileSync(desktop, '#!/bin/sh\n', { mode: 0o755 });
  const options = { cwd: root, path: bin, desktop: [desktop] };
  assert.equal(resolveCodexBin('codex', options), join(bin, 'codex'));
  chmodSync(join(bin, 'codex'), 0o644);
  assert.equal(resolveCodexBin('codex', options), desktop);
  assert.equal(resolveCodexBin('./Desktop app/codex', options), desktop);
  assert.throws(() => resolveCodexBin('./missing', options), /找不到可执行/);
  assert.throws(() => resolveCodexBin('custom-codex', options), /找不到可执行/);
  assert.throws(() => resolveCodexBin('codex', { ...options, desktop: [] }), /找不到可执行/);
});

test('build rejects a missing explicit binary before npm bootstrap or package writes', () => {
  const result = spawnSync(process.execPath, ['scripts/build.js', '--binary', '/missing-codex-build-test/codex'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /找不到可执行/);
  assert.doesNotMatch(result.stdout, /安装锁定依赖|打包插件/);
});

test('build rejects Windows before dependency installation or configuration reads', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    Object.defineProperty(process, 'platform', { value: 'win32' });
    await import('./scripts/build.js');
  `], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /仅支持 macOS\/Linux.*Windows/);
  assert.doesNotMatch(result.stdout, /安装锁定依赖|打包插件|Codex CLI/);
});
