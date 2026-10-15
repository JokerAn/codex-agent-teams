import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { TaskStore } from '../src/store.js';
import { packPlugin } from '../src/plugin.js';
import { assertUpdateIdle, installPreparedPlugin } from '../scripts/update.js';

const selector = 'codex-agent-teams@codex-agent-teams-local';
const marketplaceName = 'codex-agent-teams-local';
const json = path => JSON.parse(readFileSync(path, 'utf8'));
function fixture(t, { fresh = false, fail, corrupt = false, onRestore, onInstall, legacy = false, withoutInstalledPath = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "teams-update-' 空格-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const workspace = join(root, 'workspace'); mkdirSync(workspace);
  const configPath = join(root, 'config.json');
  writeFileSync(configPath, JSON.stringify({ codexBin: process.execPath, profiles: { expert: { model: 'fixture' } } }));
  const packed = packPlugin({ configPath, out: join(root, 'new-marketplace') });
  const codexHome = join(root, 'home');
  const previousVersion = withoutInstalledPath ? json('package.json').version : '0.5.2';
  const cache = withoutInstalledPath ? join(codexHome, 'plugins', 'cache', marketplaceName, 'codex-agent-teams', previousVersion) : join(root, 'cache');
  mkdirSync(cache, { recursive: true }); cpSync(packed.pluginRoot, cache, { recursive: true });
  if (corrupt) writeFileSync(join(cache, 'src/contracts.js'), '// stale cached file\n');
  const previous = { name: marketplaceName, root: join(root, 'old-marketplace'),
    marketplaceSource: { sourceType: 'local', source: join(root, 'old-marketplace') } };
  const unrelated = { name: 'unrelated', root: join(root, 'unrelated') };
  if (legacy) rmSync(join(cache, 'build-info.json'));
  const previousPlugin = { pluginId: selector, version: previousVersion, enabled: true, ...(withoutInstalledPath ? {} : { installedPath: cache }) };
  let current = fresh ? undefined : previous, installed = fresh ? undefined : previousPlugin, failed = false;
  const calls = [];
  const command = args => {
    calls.push(args);
    if (!failed && fail?.(args)) { failed = true; throw new Error('injected CLI failure'); }
    if (args[1] === 'marketplace') {
      if (args[2] === 'list') return { marketplaces: [unrelated, ...(current ? [current] : [])] };
      if (args[2] === 'remove') { current = undefined; return {}; }
      current = { name: marketplaceName, root: args[3], marketplaceSource: { sourceType: 'local', source: args[3] } };
      return {};
    }
    if (args[1] === 'list') return { installed: installed ? [installed] : [] };
    if (args[1] === 'remove') { installed = undefined; return {}; }
    if (args[1] === 'add') {
      if (current.root === previous.root) onRestore?.(cache);
      else onInstall?.(cache);
      installed = current.root === previous.root ? previousPlugin : { pluginId: selector,
        version: json(join(cache, 'package.json')).version, enabled: true };
      return { installedPath: cache };
    }
    throw new Error(`Unexpected fixture command ${args}`);
  };
  return { root, workspace, packed, calls, previous, previousPlugin, state: () => ({ current, installed }),
    update: () => installPreparedPlugin({ binary: process.execPath, marketplaceRoot: packed.marketplaceRoot, workspace, codexHome, command }) };
}

for (const drift of [false, true]) {
  test(`official list without installedPath uses exact home/version cache identity; drift=${drift}`, async t => {
    const f = fixture(t, { withoutInstalledPath: true, fail: args => args[1] === 'add', onRestore: cache => {
      if (drift) writeFileSync(join(cache, 'mcp-launch.js'), '// same-version drift');
    } });
    await assert.rejects(f.update(), drift ? /恢复未完成[\s\S]*旧缓存内容未恢复/ : /安装状态已恢复（已核对原缓存关键文件/);
    assert.equal('installedPath' in f.previousPlugin, false);
  });
}

for (const file of ['mcp-launch', 'mcp-launch.js', 'mcp.json', '.mcp.json', 'teams.config.json']) {
  for (const change of ['modified', 'missing']) {
    test(`update rejects ${change} installed ${file} and verifies restored original bytes`, async t => {
      const f = fixture(t, { onInstall: cache => {
        if (change === 'missing') rmSync(join(cache, file));
        else writeFileSync(join(cache, file), 'broken-installed-file');
      }, onRestore: cache => cpSync(join(f.packed.pluginRoot, file), join(cache, file)) });
      await assert.rejects(f.update(), /实际缓存关键文件[\s\S]*原 marketplace 与插件安装状态已恢复/);
      assert.deepEqual(f.state(), { current: f.previous, installed: f.previousPlugin });
    });
  }
}

for (const change of ['executable', 'owner-executable', 'symlink', 'parent-symlink']) {
  test(`critical cache identity rejects ${change} replacement and preserves rollback checks`, async t => {
    const f = fixture(t, { onInstall: cache => {
      if (change === 'executable' || change === 'owner-executable') chmodSync(join(cache, 'mcp-launch'), change === 'executable' ? 0o600 : 0o655);
      else if (change === 'symlink') {
        rmSync(join(cache, 'mcp-launch.js'));
        symlinkSync(join(f.packed.pluginRoot, 'mcp-launch.js'), join(cache, 'mcp-launch.js'));
      } else {
        rmSync(join(cache, 'hooks'), { recursive: true });
        symlinkSync(join(f.packed.pluginRoot, 'hooks'), join(cache, 'hooks'));
      }
    }, onRestore: cache => {
      rmSync(cache, { recursive: true }); cpSync(f.packed.pluginRoot, cache, { recursive: true });
    } });
    await assert.rejects(f.update(), /缓存关键[\s\S]*原 marketplace 与插件安装状态已恢复/);
  });
}

test('update replaces only its own source/cache and verifies actual files, including paths with quotes', async t => {
  const f = fixture(t);
  const result = await f.update();
  assert.equal(result.version, json('package.json').version);
  assert.equal(f.state().current.root, f.packed.marketplaceRoot);
  const mutations = f.calls.filter(args => args[1] !== 'list' && args[2] !== 'list');
  assert.deepEqual(mutations.map(args => args.slice(0, 3)), [
    ['plugin', 'marketplace', 'remove'], ['plugin', 'marketplace', 'add'],
    ['plugin', 'remove', selector], ['plugin', 'add', selector],
  ]);
  assert.ok(mutations.every(args => args.at(-1) === '--json'));
});

test('update also supports first installation without removing an absent source/plugin', async t => {
  const f = fixture(t, { fresh: true });
  await f.update();
  assert.ok(!f.calls.some(args => args.includes('remove')));
  assert.equal(f.state().installed.version, json('package.json').version);
});

for (const stage of ['source', 'install', 'cache']) {
  test(`update restores the previous source and installation after ${stage} failure`, async t => {
    const f = fixture(t, { corrupt: stage === 'cache', fail: args => stage === 'source'
      ? args[1] === 'marketplace' && args[2] === 'add' : stage === 'install' && args[1] === 'add' });
    await assert.rejects(f.update(), /原 marketplace 与插件安装状态已恢复/);
    assert.deepEqual(f.state(), { current: f.previous, installed: f.previousPlugin });
  });
}

test('a failed fresh installation removes its partial registration instead of inventing an old source', async t => {
  const f = fixture(t, { fresh: true, fail: args => args[1] === 'add' });
  await assert.rejects(f.update(), /原 marketplace 与插件安装状态已恢复/);
  assert.deepEqual(f.state(), { current: undefined, installed: undefined });
});

test('rollback failure is reported together with the original failure', async t => {
  const f = fixture(t);
  const command = args => {
    if (args[1] === 'marketplace' && args[2] === 'list') return { marketplaces: [f.previous] };
    if (args[1] === 'list') return { installed: [f.previousPlugin] };
    throw new Error('CLI write unavailable');
  };
  await assert.rejects(installPreparedPlugin({ binary: process.execPath, marketplaceRoot: f.packed.marketplaceRoot,
    workspace: f.workspace, command }), /CLI write unavailable[\s\S]*恢复未完成/);
});

for (const changed of ['build-info.json', 'src/contracts.js']) {
  test(`rollback rejects same-version content drift in ${changed}`, async t => {
    const f = fixture(t, { fail: args => args[1] === 'add', onRestore: cache => {
      const path = join(cache, changed);
      if (changed === 'build-info.json') writeFileSync(path, JSON.stringify({ ...json(path), sourceDigest: 'c'.repeat(64) }));
      else writeFileSync(path, '// changed without changing build metadata\n');
    } });
    await assert.rejects(f.update(), /injected CLI failure[\s\S]*恢复未完成[\s\S]*旧缓存内容未恢复/);
    assert.equal(f.state().installed.version, f.previousPlugin.version);
  });
}

test('legacy rollback reports metadata recovery without claiming verified old content', async t => {
  const f = fixture(t, { legacy: true, fail: args => args[1] === 'add' });
  await assert.rejects(f.update(), /安装元数据已恢复；旧缓存内容未确认/);
});

test('update rejects a leftover portable manifest that would shadow the installed stop hooks', async t => {
  const f = fixture(t);
  writeFileSync(join(f.root, 'cache/plugin.json'), JSON.stringify({ name: 'codex-agent-teams', version: json('package.json').version }));
  await assert.rejects(f.update(), /残留根manifest/);
  assert.equal(f.state().installed.version, f.previousPlugin.version);
});

test('idle precheck is read-only, blocks owners and unfinished receipts, and permits an unused project', t => {
  const root = mkdtempSync(join(tmpdir(), 'teams-update-state-'));
  assert.doesNotThrow(() => assertUpdateIdle(root));
  const store = new TaskStore(join(root, '.codex-teams/state.sqlite'));
  t.after(() => {
    store.db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run('owner', JSON.stringify({ pid: process.pid, token: store.owner }));
    try { store.close(); } finally { rmSync(root, { recursive: true, force: true }); }
  });
  assert.throws(() => assertUpdateIdle(root), /关闭.*Team\/MCP/);
  store.db.prepare('DELETE FROM meta WHERE key=?').run('owner');
  const task = { id: 'fixture', status: 'awaiting_review', attempts: [] };
  store.save(task, 'fixture', false);
  assert.throws(() => assertUpdateIdle(root), /尚未交接/);
  task.status = 'failed'; task.attempts = [{ cleanupConfirmed: false }]; store.save(task, 'fixture', false);
  assert.throws(() => assertUpdateIdle(root), /退出未确认/);
  task.attempts = [{ memberLaunch: 'starting' }]; store.save(task, 'fixture', false);
  assert.throws(() => assertUpdateIdle(root), /退出未确认/);
  task.attempts = [{ memberLaunch: 'exited', cleanupConfirmed: true }]; store.save(task, 'fixture', false);
  const check = { id: 'worktree', verifications: [{ status: 'failed', cleanupConfirmed: false }] };
  store.saveWorkspace(check, 'fixture', false);
  assert.throws(() => assertUpdateIdle(root), /验证进程/);
  check.verifications[0].cleanupConfirmed = true; store.saveWorkspace(check, 'fixture', false);
  const before = store.db.prepare('SELECT * FROM tasks').all();
  assert.doesNotThrow(() => assertUpdateIdle(root));
  assert.deepEqual(store.db.prepare('SELECT * FROM tasks').all(), before);
});

test('CLI help and invalid binary never invoke build or installation', () => {
  const help = spawnSync(process.execPath, ['scripts/update.js', '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0); assert.match(help.stdout, /npm run update/);
  const invalid = spawnSync(process.execPath, ['scripts/update.js', '--binary', '/missing-update-codex-fixture/codex'], { encoding: 'utf8' });
  assert.equal(invalid.status, 1); assert.match(invalid.stderr, /找不到可执行|请先关闭|尚未交接/);
  assert.doesNotMatch(invalid.stdout, /安装锁定依赖|打包插件|更新完成/);
});

test('build failure stops the update before marketplace mutation', () => {
  const failed = spawnSync(process.execPath, ['scripts/update.js', '--config', '/missing-teams-update-config-fixture.json',
    '--binary', process.execPath], { encoding: 'utf8' });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /未切换插件来源或缓存|请先关闭|尚未交接/);
  assert.doesNotMatch(failed.stdout, /更新完成/);
});
