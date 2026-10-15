import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { resolveCodexBin } from './codex-bin.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const marketplaceName = 'codex-agent-teams-local';
const pluginName = 'codex-agent-teams';
const selector = `${pluginName}@${marketplaceName}`;
const json = path => JSON.parse(readFileSync(path, 'utf8'));
// Snapshot actual installed bytes before mutation, not the mutable marketplace.
// Legacy installations without build identity remain explicitly unverified.
function installationIdentity(path) {
  if (!path) return null;
  // Inspect parents as well as leaves; never follow a replaced critical path.
  const regular = (file, directory = false) => {
    const parts = file.split('/');
    for (let i = 0; i <= parts.length; i++) {
      const entry = i ? join(path, ...parts.slice(0, i)) : path;
      let stat;
      try { stat = lstatSync(entry); }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
      if (stat.isSymbolicLink() || (i < parts.length || directory ? !stat.isDirectory() : !stat.isFile())) throw new Error(`缓存关键路径类型不符：${file}`);
      if (i === parts.length) return stat;
    }
  };
  if (!regular('build-info.json')) return null;
  const build = json(join(path, 'build-info.json'));
  if (typeof build.version !== 'string' || !/^[a-f0-9]{64}$/.test(build.sourceDigest ?? '')) return null;
  // Validate src itself before enumerating it.
  const src = regular('src', true);
  const files = [...(src ? readdirSync(join(path, 'src')).filter(name => name.endsWith('.js')).map(name => `src/${name}`) : []),
    'build-info.json', 'package.json', 'PRINCIPLES.md', 'skills/team/SKILL.md', 'plugin.json', '.codex-plugin/plugin.json',
    'skills/strict-delivery/SKILL.md', 'hooks/hooks.json', 'teams.config.json', 'mcp.json', '.mcp.json', 'mcp-launch', 'mcp-launch.js'].sort();
  if (build.mode === 'native') {
    if (src || existsSync(join(path, 'node_modules'))) throw new Error('原生skill缓存残留外置运行时或依赖');
  } else if (!src) throw new Error('严格交付缓存缺少源码目录');
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file + '\0');
    const stat = regular(file);
    if (stat) {
      if (file === 'mcp-launch') hash.update(`executable:${stat.mode & 0o111}\0`);
      hash.update(readFileSync(join(path, file)));
    } else hash.update('\0absent');
    hash.update('\0');
  }
  return hash.digest('hex');
}
const alive = (pid, group = false) => {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(group ? -pid : pid, 0); return true; }
  catch (error) { return error.code !== 'ESRCH'; }
};

/** Bootstrap cannot import npm dependencies yet. Observe only; never recover or acquire owner. */
export function assertUpdateIdle(workspace) {
  const directory = join(workspace, '.codex-teams'), path = join(directory, 'state.sqlite');
  if (!existsSync(path)) return;
  if (lstatSync(directory).isSymbolicLink() || lstatSync(path).isSymbolicLink()) throw new Error('任务状态目录和数据库不能是符号链接。');
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    db.exec('PRAGMA busy_timeout=3000; BEGIN');
    if (db.prepare('SELECT value FROM meta WHERE key=?').get('version')?.value !== '1') throw new Error('不支持的任务状态版本。');
    const owner = db.prepare('SELECT value FROM meta WHERE key=?').get('owner');
    if (owner && alive(JSON.parse(owner.value).pid)) throw new Error('请先关闭持有本项目的 Team/MCP 会话，再执行 npm run update。');
    for (const { data } of db.prepare('SELECT data FROM tasks').all()) {
      const task = JSON.parse(data), attempt = task.attempts?.at(-1);
      if (['running', 'integrating', 'awaiting_review', 'awaiting_integration'].includes(task.status) || attempt?.cleanupConfirmed === false ||
        [attempt, attempt?.machineReview].some(launch => alive(launch?.childPid, true) || (launch?.memberLaunch && launch.memberLaunch !== 'exited'))) {
        throw new Error(`任务 ${task.id} 尚未交接或退出未确认；先处理任务，再执行 npm run update。`);
      }
    }
    for (const { data } of db.prepare('SELECT data FROM workspaces').all()) {
      if (JSON.parse(data).verifications?.some(check => check.status === 'running' || check.cleanupConfirmed === false || alive(check.childPid, true))) {
        throw new Error('存在未确认退出的验证进程；先处理验证，再执行 npm run update。');
      }
    }
  } finally { db.close(); }
}

function codexCommand(binary, args) {
  try {
    return JSON.parse(execFileSync(binary, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, maxBuffer: 4 * 1024 * 1024 }));
  } catch (error) {
    throw new Error(`codex ${args.join(' ')} 失败：${String(error.stderr || error.message).trim().slice(-2400)}`, { cause: error });
  }
}

/** Called only by the explicitly invoked update command, after a successful build/doctor. */
export async function installPreparedPlugin({ binary, marketplaceRoot, workspace = root, codexHome = process.env.CODEX_HOME ?? join(homedir(), '.codex'), command = args => codexCommand(binary, args) }) {
  const { pluginTarget } = await import('../src/plugin-package.js');
  const target = pluginTarget(marketplaceRoot);
  const expectedIdentity = installationIdentity(target.pluginRoot);
  assert(expectedIdentity, '候选包缺少有效关键文件身份');
  const expected = json(join(target.pluginRoot, 'build-info.json'));
  assert.equal(expected.version, json(join(target.pluginRoot, 'package.json')).version, '候选包版本不一致');
  assert.match(expected.sourceDigest, /^[a-f0-9]{64}$/);
  const listMarkets = () => command(['plugin', 'marketplace', 'list', '--json']).marketplaces;
  const listPlugins = () => command(['plugin', 'list', '--marketplace', marketplaceName, '--json']).installed;
  const beforeMarkets = listMarkets();
  const previous = beforeMarkets.find(entry => entry.name === marketplaceName);
  if (previous && previous.marketplaceSource?.sourceType !== 'local') throw new Error('现有同名 marketplace 不是本地来源；请先手动核对来源，未执行替换。');
  const installedBefore = listPlugins();
  if (installedBefore.some(entry => entry.pluginId !== selector)) throw new Error('同名 marketplace 中还有其他已安装插件；未执行替换。');
  const previousPlugin = installedBefore.find(entry => entry.pluginId === selector);
  if (previousPlugin && !previous) throw new Error('已安装插件缺少可恢复的 marketplace 来源；未执行替换。');
  if (previousPlugin?.enabled === false) throw new Error('当前插件已禁用；请先启用或手动管理该安装，未执行替换。');
  // The local CLI list omits installedPath. Its add receipt confirms this exact
  // versioned cache layout. Resolve only that path in the effective Codex home;
  // never enumerate caches or fingerprint the mutable marketplace as installed.
  const previousPath = previousPlugin?.installedPath ?? (typeof previousPlugin?.version === 'string' && /^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(previousPlugin.version)
    ? join(resolve(codexHome), 'plugins', 'cache', marketplaceName, pluginName, previousPlugin.version) : undefined);
  const previousIdentity = installationIdentity(previousPath);
  assertUpdateIdle(workspace);
  let marketplaceChanged = false, pluginChanged = false;
  const mutate = args => command([...args, '--json']);
  try {
    // Keep the old installation until the new marketplace source is registered.
    marketplaceChanged = true;
    if (previous) mutate(['plugin', 'marketplace', 'remove', marketplaceName]);
    mutate(['plugin', 'marketplace', 'add', target.marketplaceRoot]);
    assertUpdateIdle(workspace);
    pluginChanged = true;
    if (previousPlugin) mutate(['plugin', 'remove', selector]);
    const installed = mutate(['plugin', 'add', selector]);
    if (!existsSync(join(target.pluginRoot, 'plugin.json'))) assert.equal(existsSync(join(installed.installedPath, 'plugin.json')), false, '实际缓存残留根manifest，会遮蔽停止hooks');
    assert.equal(installationIdentity(installed.installedPath), expectedIdentity, '实际缓存关键文件或执行位与候选不一致');
    const actual = json(join(installed.installedPath, 'build-info.json'));
    assert.equal(actual.version, expected.version, '实际缓存版本与新包不符');
    assert.equal(actual.sourceDigest, expected.sourceDigest, '实际缓存摘要与新包不符');
    const afterMarkets = listMarkets();
    assert.equal(afterMarkets.find(entry => entry.name === marketplaceName)?.root, target.marketplaceRoot, '实际 marketplace 来源不符');
    for (const entry of beforeMarkets.filter(entry => entry.name !== marketplaceName)) {
      assert.deepEqual(afterMarkets.find(value => value.name === entry.name), entry, '其他 marketplace 发生变化');
    }
    return { installedPath: installed.installedPath, version: actual.version, sourceDigest: actual.sourceDigest, marketplaceRoot: target.marketplaceRoot };
  } catch (error) {
    const recoveryErrors = [];
    const recover = action => { try { action(); } catch (failure) { recoveryErrors.push(failure.message); } };
    if (pluginChanged) recover(() => { if (listPlugins().some(entry => entry.pluginId === selector)) mutate(['plugin', 'remove', selector]); });
    if (marketplaceChanged) {
      recover(() => { if (listMarkets().some(entry => entry.name === marketplaceName)) mutate(['plugin', 'marketplace', 'remove', marketplaceName]); });
      if (previous) recover(() => mutate(['plugin', 'marketplace', 'add', previous.marketplaceSource.source]));
    }
    let restoredPath;
    if (pluginChanged && previousPlugin) recover(() => { restoredPath = mutate(['plugin', 'add', selector]).installedPath; });
    recover(() => {
      assert.deepEqual(listMarkets().find(entry => entry.name === marketplaceName), previous, '旧 marketplace 未恢复');
      const restored = listPlugins().find(entry => entry.pluginId === selector);
      assert.equal(restored?.version, previousPlugin?.version, '旧插件版本未恢复');
      assert.equal(restored?.enabled, previousPlugin?.enabled, '旧插件启用状态未恢复');
      if (previousIdentity) assert.equal(installationIdentity(restored?.installedPath ?? restoredPath ?? previousPath), previousIdentity, '旧缓存内容未恢复');
    });
    const recovered = previousPlugin && !previousIdentity
      ? '原 marketplace 与插件安装元数据已恢复；旧缓存内容未确认，请手动核对。'
      : '原 marketplace 与插件安装状态已恢复（已核对原缓存关键文件；运行依赖未逐文件核对）。';
    throw new Error(`${error.message}\n${recoveryErrors.length ? `恢复未完成：${recoveryErrors.join('; ')}。请手动检查插件安装。` : recovered}\n候选包保留：${target.marketplaceRoot}`, { cause: error });
  }
}

async function main() {
  if (!['darwin', 'linux'].includes(process.platform)) throw new Error('更新仅支持 macOS/Linux。');
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('需要 Node.js 24 或更新版本。');
  const { values } = parseArgs({ options: { strict: { type: 'boolean' }, config: { type: 'string' }, out: { type: 'string' }, binary: { type: 'string' }, help: { type: 'boolean' } } });
  if (values.help) {
    console.log('npm run update [-- --strict --config <file> --binary <codex path> --out <new directory>]\n默认更新原生skill包；--strict显式安装外置交付链路。通过官方CLI安装，不运行推理，完成后重启Codex。');
    return;
  }
  assertUpdateIdle(root);
  const configPath = resolve(root, values.config ?? process.env.TEAMS_CONFIG ?? 'teams.local.json');
  if (values.config && !values.strict) throw new Error('--config requires --strict; native update needs no model configuration.');
  const settings = values.strict && existsSync(configPath) ? json(configPath) : null;
  const binary = resolveCodexBin(values.binary ?? settings?.codexBin ?? 'codex', { cwd: values.binary ? process.cwd() : dirname(configPath) });
  const { version } = json(join(root, 'package.json'));
  const out = values.out ? resolve(root, values.out) : join(root, 'dist', `marketplace-v${version}${values.strict ? '-strict' : ''}-update-${Date.now()}-${randomUUID().slice(0, 8)}`);
  console.log('更新 Codex Agent Teams：构建并检查新包 → 切换来源 → 重装缓存 → 核对版本。\n请先结束其他项目的 Team 任务并关闭对应会话；本命令只检查当前项目的运行状态。');
  const args = [join(root, 'scripts/build.js'), '--out', out];
  if (values.strict) args.push('--strict', '--binary', binary);
  if (values.config) args.push('--config', configPath);
  const built = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (built.error) throw built.error;
  if (built.status !== 0) throw new Error(`构建或检查失败（${built.signal ?? built.status}），未切换插件来源或缓存。`);
  const result = await installPreparedPlugin({ binary, marketplaceRoot: out });
  console.log(`\n更新完成：v${result.version}\n来源：${result.marketplaceRoot}\n实际缓存：${result.installedPath}\n源码摘要：${result.sourceDigest}\n\n请重启 Codex 并开启新聊天，让新的 skill/MCP 生效。已加载的旧会话不会热更新。`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await main(); }
  catch (error) { console.error(`\n更新失败：${error.message}`); process.exitCode = 1; }
}
