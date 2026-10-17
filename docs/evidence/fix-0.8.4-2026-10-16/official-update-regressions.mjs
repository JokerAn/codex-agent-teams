// Explicit official-CLI checks. Temporary homes only, no model inference.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packNativePlugin } from '../../../src/plugin-package.js';
import { installPreparedPlugin } from '../../../scripts/update.js';

const binary = process.env.TEAMS_AUDIT_CODEX_BIN ?? execFileSync('which', ['codex'], { encoding: 'utf8' }).trim();
const self = fileURLToPath(import.meta.url), selector = 'codex-agent-teams@codex-agent-teams-local';
const marketName = 'codex-agent-teams-local';
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
const sha = path => existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : null;
const command = (root, args) => JSON.parse(execFileSync(binary, args, {
  cwd: join(root, 'workspace'), env: { ...process.env, CODEX_HOME: join(root, 'home') },
  encoding: 'utf8', stdio: 'pipe', timeout: 30000,
}));
const update = (root, marketplaceRoot, adapter) => installPreparedPlugin({ binary, marketplaceRoot,
  workspace: join(root, 'workspace'), codexHome: join(root, 'home'), ...(adapter ? { command: adapter } : {}) });
function version(packed, value) {
  for (const file of ['package.json', '.codex-plugin/plugin.json', 'build-info.json']) {
    const path = join(packed.pluginRoot, file); save(path, { ...json(path), version: value });
  }
  const digest = createHash('sha256');
  for (const file of ['.codex-plugin/plugin.json', 'package.json', 'skills/team/SKILL.md']) { digest.update(file + '\0'); digest.update(readFileSync(join(packed.pluginRoot, file))); }
  const build = join(packed.pluginRoot, 'build-info.json'); save(build, { ...json(build), sourceDigest: digest.digest('hex') });
}
if (process.argv[2] === 'second-updater') {
  try { await update(process.argv[3], process.argv[4]); process.exitCode = 9; }
  catch (error) { console.log(error.message); process.exitCode = /更新锁已存在/.test(error.message) ? 7 : 8; }
} else {
  const run = mkdtempSync(join(tmpdir(), 'teams-084-official-'));
  const formalConfig = join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'config.toml');
  const beforeConfig = sha(formalConfig), results = [];
  const environment = { node: process.version, cli: execFileSync(binary, ['--version'], { encoding: 'utf8' }).trim(), binary };
  const setup = (name, withOld = true) => {
    const root = join(run, name); mkdirSync(root); mkdirSync(join(root, 'home')); mkdirSync(join(root, 'workspace'));
    const next = packNativePlugin({ out: join(root, 'next') });
    if (!withOld) return { root, next };
    const old = packNativePlugin({ out: join(root, 'old') }); version(old, '0.8.3');
    command(root, ['plugin', 'marketplace', 'add', old.marketplaceRoot, '--json']);
    const receipt = command(root, ['plugin', 'add', selector, '--json']);
    return { root, next, old, receipt };
  };
  for (const defect of ['manifest-version', 'unknown-mode', 'digest-drift']) {
    const f = setup(defect, false);
    if (defect === 'manifest-version') {
      const path = join(f.next.pluginRoot, '.codex-plugin/plugin.json'); save(path, { ...json(path), version: '99.0.0' });
    } else if (defect === 'unknown-mode') {
      const path = join(f.next.pluginRoot, 'build-info.json'); save(path, { ...json(path), mode: 'native-typo' });
      mkdirSync(join(f.next.pluginRoot, 'src')); writeFileSync(join(f.next.pluginRoot, 'extra-runtime.js'), '// unexpected');
    } else writeFileSync(join(f.next.pluginRoot, 'skills/team/SKILL.md'), 'changed candidate');
    await assert.rejects(update(f.root, f.next.marketplaceRoot), /候选包/);
    assert.deepEqual(readdirSync(join(f.root, 'home')), [], 'semantic preflight leaves home untouched');
    results.push({ name: defect, rejectedBeforeMutation: true });
  }
  {
    const f = setup('concurrent-updaters');
    const other = packNativePlugin({ out: join(f.root, 'other') }); version(other, '99.0.0');
    let installed = false, refused = false;
    const adapter = args => {
      if (args[1] === 'add') installed = true;
      if (installed && !refused && args[1] === 'marketplace' && args[2] === 'list') {
        const child = spawnSync(process.execPath, [self, 'second-updater', f.root, other.marketplaceRoot], { encoding: 'utf8', timeout: 30000 });
        assert.equal(child.status, 7, child.stdout + child.stderr); refused = true;
      }
      return command(f.root, args);
    };
    const result = await update(f.root, f.next.marketplaceRoot, adapter);
    const final = command(f.root, ['plugin', 'list', '--marketplace', marketName, '--json']).installed;
    assert(refused); assert.equal(final[0].version, result.version); assert(existsSync(result.installedPath));
    results.push({ name: 'concurrent-updaters', secondProcessRefused: true, finalVersion: final[0].version });
  }
  {
    const f = setup('external-cli-conflict');
    const foreign = packNativePlugin({ out: join(f.root, 'foreign') }); version(foreign, '99.0.1');
    let installed = false, changed = false, foreignPath;
    const adapter = args => {
      if (args[1] === 'add') installed = true;
      if (installed && !changed && args[1] === 'marketplace' && args[2] === 'list') {
        changed = true;
        command(f.root, ['plugin', 'marketplace', 'remove', marketName, '--json']);
        command(f.root, ['plugin', 'marketplace', 'add', foreign.marketplaceRoot, '--json']);
        command(f.root, ['plugin', 'remove', selector, '--json']);
        foreignPath = command(f.root, ['plugin', 'add', selector, '--json']).installedPath;
      }
      return command(f.root, args);
    };
    await assert.rejects(update(f.root, f.next.marketplaceRoot, adapter), /所有权.*未自动删除或回滚/s);
    const final = command(f.root, ['plugin', 'list', '--marketplace', marketName, '--json']).installed;
    assert(changed); assert.equal(final[0].version, '99.0.1'); assert(existsSync(foreignPath));
    results.push({ name: 'external-cli-conflict', foreignVersionPreserved: final[0].version });
  }
  {
    const f = setup('late-recovery-source-drift');
    const before = readFileSync(join(f.receipt.installedPath, 'skills/team/SKILL.md'));
    let injected = false, error;
    const adapter = args => {
      if (args[1] === 'add' && !injected) {
        injected = true; assert.equal(existsSync(f.receipt.installedPath), false);
        writeFileSync(join(f.old.pluginRoot, 'skills/team/SKILL.md'), 'changed old source after removal');
        throw new Error('controlled failed new installation');
      }
      return command(f.root, args);
    };
    try { await update(f.root, f.next.marketplaceRoot, adapter); } catch (failure) { error = failure.message; }
    assert.match(error, /安装状态已恢复/); assert.match(error, /恢复副本保留/);
    assert.deepEqual(readFileSync(join(f.receipt.installedPath, 'skills/team/SKILL.md')), before);
    const final = command(f.root, ['plugin', 'list', '--marketplace', marketName, '--json']).installed;
    assert.equal(final[0].version, '0.8.3');
    results.push({ name: 'late-recovery-source-drift', originalBytesRestored: true, backupRetained: true });
  }
  {
    const root = join(run, 'archive-consumer'); mkdirSync(root); mkdirSync(join(root, 'home')); mkdirSync(join(root, 'workspace'));
    const name = 'codex-agent-teams-native-0.8.4', buildRoot = join(root, name);
    execFileSync(process.execPath, [fileURLToPath(new URL('../../../scripts/build.js', import.meta.url)), '--out', buildRoot], { stdio: 'pipe' });
    const archive = join(root, name + '.tar.gz');
    execFileSync('tar', ['-czf', archive, '-C', root, name]);
    const archiveSHA256 = sha(archive); writeFileSync(archive + '.sha256', archiveSHA256 + '  ' + name + '.tar.gz\n');
    const unpack = join(root, 'unpack'); mkdirSync(unpack); execFileSync('tar', ['-xzf', archive, '-C', unpack]);
    const result = await update(root, join(unpack, name));
    for (const file of ['.codex-plugin/plugin.json', 'package.json', 'build-info.json', 'skills/team/SKILL.md']) {
      assert.deepEqual(readFileSync(join(buildRoot, 'plugins/codex-agent-teams', file)), readFileSync(join(result.installedPath, file)));
    }
    assert.equal(result.version, '0.8.4');
    results.push({ name: 'archive-consumer', version: result.version, archive, archiveSHA256, installedBytesMatch: true });
  }
  assert.equal(sha(formalConfig), beforeConfig);
  const output = { run, environment, results, inferenceStarted: false, formalConfigUnchanged: true };
  save(join(run, 'results.json'), output);
  // Homes are disposable; keep only package assets, raw receipts and result evidence.
  for (const name of readdirSync(run)) if (existsSync(join(run, name, 'home'))) rmSync(join(run, name, 'home'), { recursive: true, force: true });
  console.log(JSON.stringify(output, null, 2));
}
