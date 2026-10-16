import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { TaskStore } from '../src/store.js';
import { packPlugin } from '../src/plugin.js';
import { packNativePlugin, pluginTarget } from '../src/plugin-package.js';
import { assertUpdateIdle, installPreparedPlugin } from '../scripts/update.js';

const selector = 'codex-agent-teams@codex-agent-teams-local';
const marketplaceName = 'codex-agent-teams-local';
const json = path => JSON.parse(readFileSync(path, 'utf8'));
function fixture(t, { fresh = false, fail, corrupt = false, onRestore, onInstall, onRegister, legacy = false,
  withoutInstalledPath = false, native = false, previousNative = native, sameVersion = false, fakeRestore = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "teams-update-' 空格-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const workspace = join(root, 'workspace'); mkdirSync(workspace);
  const configPath = join(root, 'config.json');
  writeFileSync(configPath, JSON.stringify({ codexBin: process.execPath, profiles: { expert: { model: 'fixture' } } }));
  const packed = native ? packNativePlugin({ out: join(root, 'new-marketplace') }) : packPlugin({ configPath, out: join(root, 'new-marketplace') });
  const codexHome = join(root, 'home');
  const nextVersion = json(join(packed.pluginRoot, 'package.json')).version;
  const previousVersion = sameVersion ? nextVersion : '0.0.0-fixture-old';
  const previous = { name: marketplaceName, root: join(root, 'old-marketplace'),
    marketplaceSource: { sourceType: 'local', source: join(root, 'old-marketplace') } };
  if (previousNative === native) {
    cpSync(packed.marketplaceRoot, previous.root, { recursive: true });
  } else if (previousNative) {
    packNativePlugin({ out: previous.root });
  } else {
    packPlugin({ configPath, out: previous.root });
  }
  const previousRoot = pluginTarget(previous.root).pluginRoot;
  for (const file of ['package.json', '.codex-plugin/plugin.json', 'build-info.json']) {
    const path = join(previousRoot, file);
    writeFileSync(path, JSON.stringify({ ...json(path), version: previousVersion }));
  }
  const previousSkill = readFileSync(join(previousRoot, 'skills/team/SKILL.md'), 'utf8') + '\nOld fixture instructions.\n';
  writeFileSync(join(previousRoot, 'skills/team/SKILL.md'), previousSkill);
  const buildPath = join(previousRoot, 'build-info.json');
  writeFileSync(buildPath, JSON.stringify({ ...json(buildPath), sourceDigest: createHash('sha256').update(previousSkill).digest('hex') }));
  if (legacy) { rmSync(buildPath); }
  const cacheFor = version => join(codexHome, 'plugins', 'cache', marketplaceName, 'codex-agent-teams', version);
  const cache = cacheFor(previousVersion);
  if (!fresh) { cpSync(previousRoot, cache, { recursive: true }); }
  const metadata = (path, version = json(join(path, 'package.json')).version) => ({
    pluginId: selector, version, enabled: true, ...(withoutInstalledPath ? {} : { installedPath: path }),
  });
  const previousPlugin = metadata(cache, previousVersion);
  const unrelated = { name: 'unrelated', root: join(root, 'unrelated') };
  let current = fresh ? undefined : previous, installed = fresh ? undefined : previousPlugin, failed = false;
  const calls = [];
  const command = args => {
    calls.push(args);
    if (!failed && fail?.(args)) { failed = true; throw new Error('injected CLI failure'); }
    if (args[1] === 'marketplace') {
      if (args[2] === 'list') { return { marketplaces: [unrelated, ...(current ? [current] : [])] }; }
      if (args[2] === 'remove') { current = undefined; return {}; }
      pluginTarget(args[3]);
      current = { name: marketplaceName, root: args[3], marketplaceSource: { sourceType: 'local', source: args[3] } };
      onRegister?.(current);
      return {};
    }
    if (args[1] === 'list') { return { installed: installed ? [installed] : [] }; }
    if (args[1] === 'remove') {
      if (installed) { rmSync(cacheFor(installed.version), { recursive: true, force: true }); }
      installed = undefined;
      return {};
    }
    if (args[1] === 'add') {
      const restoring = current.root === previous.root;
      const source = pluginTarget(current.root).pluginRoot;
      const version = json(join(source, 'package.json')).version;
      const installedPath = cacheFor(version);
      rmSync(installedPath, { recursive: true, force: true });
      // A dishonest restore receipt is an explicit negative control, never the normal fixture.
      cpSync(restoring && fakeRestore ? packed.pluginRoot : source, installedPath, { recursive: true });
      installed = metadata(installedPath, version);
      if (restoring) {
        onRestore?.(installedPath, source);
      } else {
        if (corrupt) { writeFileSync(join(installedPath, 'src/contracts.js'), '// stale cached file\n'); }
        onInstall?.(installedPath, source);
      }
      return { installedPath };
    }
    throw new Error(`Unexpected fixture command ${args}`);
  };
  return { root, workspace, packed, calls, previous, previousRoot, previousPlugin, state: () => ({ current, installed }),
    cache, nextCache: cacheFor(nextVersion),
    update: () => installPreparedPlugin({ binary: process.execPath, marketplaceRoot: packed.marketplaceRoot, workspace, codexHome, command }) };
}

test('native installation and rollback verify a dependency-free cache without requiring src', async t => {
  const f = fixture(t, { native: true });
  assert.equal((await f.update()).version, json('package.json').version);
  const failed = fixture(t, { native: true, fail: args => args[1] === 'add' });
  await assert.rejects(failed.update(), /原 marketplace 与插件安装状态已恢复/);
});

test('native installation rejects an extra skill and restores the old cache', async t => {
  const f = fixture(t, { native: true, onInstall: cache => {
    mkdirSync(join(cache, 'skills/extra'));
    writeFileSync(join(cache, 'skills/extra/SKILL.md'), 'unexpected instructions');
  } });
  await assert.rejects(f.update(), /原生skill包目录清单不符[\s\S]*安装状态已恢复/);
});

const nativeFiles = ['.codex-plugin/plugin.json', 'package.json', 'build-info.json', 'skills/team/SKILL.md'];
const nativeBytes = root => nativeFiles.map(file => [file, readFileSync(join(root, file))]);
const mutations = calls => calls.filter(args => args[1] !== 'list' && args[2] !== 'list');

for (const sameVersion of [false, true]) {
  test(`native update copies genuinely different bytes; sameVersion=${sameVersion}`, async t => {
    const f = fixture(t, { native: true, sameVersion });
    const before = nativeBytes(f.cache), expected = nativeBytes(f.packed.pluginRoot);
    assert.notDeepEqual(before, expected);
    assert.notEqual(json(join(f.cache, 'build-info.json')).sourceDigest, json(join(f.packed.pluginRoot, 'build-info.json')).sourceDigest);
    assert.equal(f.previousPlugin.version === json(join(f.packed.pluginRoot, 'package.json')).version, sameVersion);
    const result = await f.update();
    assert.deepEqual(nativeBytes(result.installedPath), expected);
    if (!sameVersion) { assert.equal(existsSync(f.cache), false, 'old version cache was removed'); }
  });

  test(`native failure restores genuinely old bytes; sameVersion=${sameVersion}`, async t => {
    const f = fixture(t, { native: true, sameVersion, onInstall: cache => {
      writeFileSync(join(cache, 'skills/team/SKILL.md'), 'broken new installation');
    } });
    const before = nativeBytes(f.cache);
    assert.notDeepEqual(before, nativeBytes(f.packed.pluginRoot));
    await assert.rejects(f.update(), /实际缓存关键文件[\s\S]*安装状态已恢复/);
    assert.deepEqual(nativeBytes(f.cache), before);
    assert.deepEqual(f.state(), { current: f.previous, installed: f.previousPlugin });
  });
}

test('rollback rejects old metadata accompanied by new cache bytes', async t => {
  const f = fixture(t, { native: true, fakeRestore: true, fail: args => args[1] === 'add' });
  await assert.rejects(f.update(), /恢复未完成[\s\S]*旧缓存内容未恢复/);
  assert.equal(f.state().installed.version, f.previousPlugin.version);
  assert.deepEqual(nativeBytes(f.cache), nativeBytes(f.packed.pluginRoot));
});

for (const failInstall of [false, true]) {
  test(`strict to native copies the selected mode and preserves rollback; failure=${failInstall}`, async t => {
    const f = fixture(t, { native: true, previousNative: false, onInstall: cache => {
      if (failInstall) { writeFileSync(join(cache, 'skills/team/SKILL.md'), 'broken native installation'); }
    } });
    const before = nativeBytes(f.cache);
    const strictLauncher = readFileSync(join(f.cache, 'mcp-launch'));
    assert.equal(json(join(f.cache, 'build-info.json')).mode, 'strict');
    if (failInstall) {
      await assert.rejects(f.update(), /实际缓存关键文件[\s\S]*安装状态已恢复/);
      assert.deepEqual(nativeBytes(f.cache), before);
      assert.deepEqual(readFileSync(join(f.cache, 'mcp-launch')), strictLauncher);
      assert.equal(existsSync(join(f.cache, 'src/cli.js')), true);
      assert.deepEqual(f.state(), { current: f.previous, installed: f.previousPlugin });
    } else {
      const result = await f.update();
      assert.deepEqual(nativeBytes(result.installedPath), nativeBytes(f.packed.pluginRoot));
      assert.equal(existsSync(join(result.installedPath, 'src')), false);
      assert.equal(existsSync(join(result.installedPath, 'mcp-launch')), false);
      assert.equal(existsSync(f.cache), false);
    }
  });
}

const nativePollution = {
  'extra skill': root => {
    mkdirSync(join(root, 'skills/extra'));
    writeFileSync(join(root, 'skills/extra/SKILL.md'), 'unexpected instructions');
  },
  'root runtime file': root => writeFileSync(join(root, 'runtime.js'), 'throw new Error("must not execute");'),
  'team helper': root => writeFileSync(join(root, 'skills/team/helper.js'), 'unexpected helper'),
  'empty directory': root => mkdirSync(join(root, 'empty')),
  'unlisted symlink': (root, external) => symlinkSync(external, join(root, 'unlisted-link')),
  'missing required file': root => rmSync(join(root, 'skills/team/SKILL.md')),
};

for (const [kind, pollute] of Object.entries(nativePollution)) {
  for (const phase of ['candidate', 'old cache', 'recovery source', 'identical pollution']) {
    test(`native inventory rejects ${kind} in ${phase} before any mutation`, async t => {
      const f = fixture(t, { native: true });
      // A dangling target makes following an unlisted link observable as ENOENT,
      // while a proper lstat inventory reports the directory-list error instead.
      const external = join(f.root, 'external-never-created');
      const targets = phase === 'candidate' ? [f.packed.pluginRoot] : phase === 'old cache' ? [f.cache]
        : phase === 'recovery source' ? [f.previousRoot] : [f.packed.pluginRoot, f.cache, f.previousRoot];
      for (const target of targets) { pollute(target, external); }
      await assert.rejects(f.update(), /原生skill包目录清单不符/);
      assert.deepEqual(mutations(f.calls), [], 'precheck must not mutate marketplace or cache');
      assert.equal(existsSync(f.cache), true, 'old cache must not be removed');
      assert.equal(existsSync(external), false);
      assert.deepEqual(f.state(), { current: f.previous, installed: f.previousPlugin });
    });
  }

  test(`native inventory rejects installed ${kind} and restores old bytes`, async t => {
    const f = fixture(t, { native: true, onInstall: cache => pollute(cache, join(f.root, 'external-never-created')) });
    const before = nativeBytes(f.cache);
    await assert.rejects(f.update(), /原生skill包目录清单不符[\s\S]*安装状态已恢复/);
    assert.deepEqual(nativeBytes(f.cache), before);
    assert.deepEqual(f.state(), { current: f.previous, installed: f.previousPlugin });
  });

  test(`native inventory rejects ${kind} during rollback instead of reporting recovery`, async t => {
    const f = fixture(t, { native: true, fail: args => args[1] === 'add',
      onRestore: cache => pollute(cache, join(f.root, 'external-never-created')) });
    await assert.rejects(f.update(), error => {
      assert.match(error.message, /恢复未完成[\s\S]*原生skill包目录清单不符/);
      assert.doesNotMatch(error.message, /原 marketplace 与插件安装状态已恢复/);
      return true;
    });
  });
}

test('native update rejects leftover runtime source instead of reporting a lightweight installation', async t => {
  const f = fixture(t, { native: true, onInstall: cache => { mkdirSync(join(cache, 'src')); writeFileSync(join(cache, 'src/cli.js'), '// leftover runtime'); },
    onRestore: cache => rmSync(join(cache, 'src'), { recursive: true, force: true }) });
  await assert.rejects(f.update(), /残留外置运行时[\s\S]*安装状态已恢复/);
});

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
      }, onRestore: (cache, source) => cpSync(join(source, file), join(cache, file)) });
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
    }, onRestore: (cache, source) => {
      rmSync(cache, { recursive: true }); cpSync(source, cache, { recursive: true });
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

for (const failure of ['missing-marketplace', 'missing-plugin', 'malformed-catalog', 'changed-skill', 'changed-build']) {
  test(`update preserves the existing installation before mutation when recovery source is ${failure}`, async t => {
    const f = fixture(t, { native: true, fail: args => args[1] === 'add' });
    const source = join(f.previous.root, 'plugins/codex-agent-teams');
    if (failure === 'missing-marketplace') {
      rmSync(f.previous.root, { recursive: true });
    } else if (failure === 'missing-plugin') {
      rmSync(source, { recursive: true });
    } else if (failure === 'malformed-catalog') {
      writeFileSync(join(f.previous.root, '.agents/plugins/marketplace.json'), '{');
    } else if (failure === 'changed-skill') {
      writeFileSync(join(source, 'skills/team/SKILL.md'), 'changed after installation');
    } else {
      writeFileSync(join(source, 'build-info.json'), JSON.stringify({ ...json(join(source, 'build-info.json')), sourceDigest: 'f'.repeat(64) }));
    }
    await assert.rejects(f.update(), /旧插件.*恢复来源.*未修改/);
    assert.deepEqual(f.state(), { current: f.previous, installed: f.previousPlugin });
    assert.ok(f.calls.every(args => args[1] === 'list' || args[2] === 'list'), 'no marketplace or plugin mutation is allowed');
  });
}

for (const failure of ['missing', 'changed']) {
  test(`recovery source ${failure} during registration preserves old cache and never uninstalls the plugin`, async t => {
    const f = fixture(t, { native: true, onRegister: current => {
      if (current.root === f.packed.marketplaceRoot) {
        if (failure === 'missing') {
          rmSync(f.previous.root, { recursive: true });
        } else {
          writeFileSync(join(f.previous.root, 'plugins/codex-agent-teams/skills/team/SKILL.md'), 'changed during registration');
        }
      }
    } });
    const before = ['build-info.json', 'package.json', '.codex-plugin/plugin.json', 'skills/team/SKILL.md']
      .map(file => [file, readFileSync(join(f.cache, file))]);
    await assert.rejects(f.update(), failure === 'missing'
      ? /旧插件恢复来源[\s\S]*恢复未完成/
      : /旧插件恢复来源[\s\S]*安装状态已恢复/);
    assert.equal(f.state().installed, f.previousPlugin);
    assert.deepEqual(f.state().current, failure === 'missing' ? undefined : f.previous);
    assert.ok(!f.calls.some(args => args[1] === 'remove' || args[1] === 'add'), 'no plugin removal or installation');
    for (const [file, bytes] of before) {
      assert.deepEqual(readFileSync(join(f.cache, file)), bytes, file);
    }
  });
}

test('legacy installation without a verifiable identity is preserved before mutation', async t => {
  const f = fixture(t, { legacy: true, fail: args => args[1] === 'add' });
  await assert.rejects(f.update(), /旧插件.*恢复来源.*未修改.*人工核对并迁移/);
  assert.deepEqual(f.state(), { current: f.previous, installed: f.previousPlugin });
  assert.ok(f.calls.every(args => args[1] === 'list' || args[2] === 'list'));
});

test('update rejects a leftover portable manifest that would shadow the installed stop hooks', async t => {
  const f = fixture(t, { onInstall: cache => {
    writeFileSync(join(cache, 'plugin.json'), JSON.stringify({ name: 'codex-agent-teams', version: json('package.json').version }));
  } });
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
  const failed = spawnSync(process.execPath, ['scripts/update.js', '--strict', '--config', '/missing-teams-update-config-fixture.json',
    '--binary', process.execPath], { encoding: 'utf8' });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /未切换插件来源或缓存|请先关闭|尚未交接/);
  assert.doesNotMatch(failed.stdout, /更新完成/);
});
