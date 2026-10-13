import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

// scripts/build.js 每次运行都会按 `marketplace-v<version>` 或 `...-<Date.now()>` 生成一个新的
// marketplace 目录，并且从不清理旧的。dist/ 里因此会累积很多同名 marketplace 包
// （catalog 名称始终是 codex-agent-teams-local），用户在 Codex 里“添加插件市场”时
// 很容易选中过期副本，装出来的是旧版本。
//
// 本脚本只负责列出/删除这些过期目录，默认 **空跑**：不带 --yes 时绝不删除任何东西。
// build.js 自身保持原样——打包与清理分开，避免构建时隐式删除用户产物。
//
// 用法：
//   node scripts/clean-dist.js                 # 列出会被删除的目录（默认 --keep 1）
//   node scripts/clean-dist.js --keep 2        # 保留最近 2 个，列出其余
//   node scripts/clean-dist.js --json          # 机器可读输出，便于脚本消费
//   node scripts/clean-dist.js --yes           # 真正删除（高风险操作，需要显式确认）
//
// 安全约束：只删除 dist/ 下**直接子目录**中满足全部条件的目录——
//   1. 目录名以 marketplace- 开头；
//   2. 内部存在 .agents/plugins/marketplace.json，且能解析成 JSON；
//   3. 不在 --keep 保留的最近列表中。
// 任何符号链接、普通文件、名字不符或缺少 marketplace 清单的目录都不会被删除。

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const defaultDist = join(projectRoot, 'dist');
const usage = `用法：node scripts/clean-dist.js [--root <dir>] [--keep <n>] [--json] [--yes]

  --root <dir>  扫描目录（默认 <项目>/dist）
  --keep <n>    保留最近修改的 n 个 marketplace 目录（默认 1，最小 1）
  --json        只输出 JSON，便于程序消费
  --yes         真正删除；缺省为空跑，只列出将被删除的目录`;

/** 读目录的 mtime；目录消失时返回 null，避免清理过程中崩在 TOCTOU 竞态上。 */
function modifiedAt(path) {
  try { return statSync(path).mtimeMs; } catch { return null; }
}

/** 只有带合法 marketplace 清单的目录才算“我们的包”，其余一律跳过。 */
function isMarketplaceDir(path) {
  const manifest = join(path, '.agents', 'plugins', 'marketplace.json');
  if (!existsSync(manifest)) return false;
  try {
    const catalog = JSON.parse(readFileSync(manifest, 'utf8'));
    return typeof catalog?.name === 'string' && Array.isArray(catalog.plugins);
  } catch { return false; }
}

/** 目录占用字节数（粗略统计包体积，用于报告）。 */
function directorySize(path) {
  let total = 0;
  const walk = current => {
    let entries;
    try { entries = readdirSync(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const child = join(current, entry.name);
      if (entry.isSymbolicLink()) { total += 0; continue; }
      if (entry.isDirectory()) { walk(child); continue; }
      try { total += statSync(child).size; } catch { /* 目录可能在删除中变化，忽略单条统计失败 */ }
    }
  };
  walk(path);
  return total;
}

function human(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  for (const [limit, suffix] of [[1024 ** 3, 'GB'], [1024 ** 2, 'MB'], [1024, 'KB']]) {
    if (bytes >= limit) return `${(bytes / limit).toFixed(1)} ${suffix}`;
  }
  return `${bytes} B`;
}

export function planCleanup({ root: scanRoot = defaultDist, keep = 1 } = {}) {
  scanRoot = resolve(scanRoot);
  const keepCount = Math.max(1, Number.isInteger(keep) ? keep : 1);
  if (!existsSync(scanRoot)) return { scanRoot, keep: keepCount, kept: [], removable: [], skipped: [], reason: '扫描目录不存在' };
  const candidates = readdirSync(scanRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.isSymbolicLink() && entry.name.startsWith('marketplace-'))
    .map(entry => {
      const path = join(scanRoot, entry.name);
      return { name: entry.name, path, mtimeMs: modifiedAt(path), valid: isMarketplaceDir(path) };
    })
    .filter(entry => entry.mtimeMs !== null);
  const skipped = candidates.filter(entry => !entry.valid).map(({ name, path }) => ({ name, path, reason: '缺少可解析的 .agents/plugins/marketplace.json' }));
  const usable = candidates.filter(entry => entry.valid).sort((a, b) => b.mtimeMs - a.mtimeMs);
  const kept = usable.slice(0, keepCount).map(entry => ({ name: entry.name, path: entry.path, mtime: new Date(entry.mtimeMs).toISOString() }));
  const removable = usable.slice(keepCount).map(entry => {
    const bytes = directorySize(entry.path);
    return {
      name: entry.name, path: entry.path, mtime: new Date(entry.mtimeMs).toISOString(),
      bytes, humanBytes: human(bytes),
    };
  });
  return { scanRoot, keep: keepCount, total: usable.length, kept, removable, skipped, reason: null };
}

export function runCleanup({ root: scanRoot = defaultDist, keep = 1, json = false, yes = false } = {}) {
  const plan = planCleanup({ root: scanRoot, keep });
  if (plan.reason) throw new Error(`扫描目录不存在：${plan.scanRoot}`);
  const freed = plan.removable.reduce((sum, entry) => sum + entry.bytes, 0);
  if (yes) {
    for (const entry of plan.removable) rmSync(entry.path, { recursive: true, force: true });
  }
  const report = {
    mode: yes ? 'apply' : 'dry-run', scanRoot: plan.scanRoot, keepLatest: plan.keep,
    foundMarketplaceDirs: plan.total, kept: plan.kept.map(entry => entry.name),
    removed: yes ? plan.removable.map(entry => entry.name) : [],
    wouldRemove: plan.removable.map(entry => ({ name: entry.name, mtime: entry.mtime, bytes: entry.bytes, humanBytes: human(entry.bytes) })),
    skipped: plan.skipped, reclaimableBytes: freed, reclaimableHuman: human(freed),
    note: yes ? '已删除；如需重新生成本机包，请运行 npm run build。' : '空跑，没有删除任何目录。确认清单后加 --yes 执行。',
  };
  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`扫描目录：${report.scanRoot}`);
    console.log(`发现 marketplace 目录：${report.foundMarketplaceDirs} 个；保留最近 ${report.keepLatest} 个：${report.kept.join(', ') || '（无）'}`);
    if (!plan.removable.length) console.log('没有可清理的目录。');
    else {
      console.log(`${yes ? '已删除' : '将删除'} ${plan.removable.length} 个，合计约 ${report.reclaimableHuman}：`);
      for (const entry of plan.removable) console.log(`  - ${entry.name}  (${entry.humanBytes}, ${entry.mtime})`);
    }
    if (plan.skipped.length) {
      console.log(`跳过 ${plan.skipped.length} 个（不是本机 marketplace 包，未删除）：`);
      for (const entry of plan.skipped) console.log(`  - ${entry.name}：${entry.reason}`);
    }
    console.log(report.note);
  }
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('需要 Node.js 24 或更新版本。');
    const { values } = parseArgs({
      options: { root: { type: 'string' }, keep: { type: 'string' }, json: { type: 'boolean' }, yes: { type: 'boolean' }, help: { type: 'boolean' } },
    });
    if (values.help) console.log(usage);
    else {
      const keep = values.keep === undefined ? 1 : Number(values.keep);
      if (!Number.isInteger(keep) || keep < 1) throw new Error(`--keep 需要是 >= 1 的整数，收到：${values.keep}`);
      runCleanup({ root: values.root === undefined ? defaultDist : resolve(process.cwd(), values.root), keep, json: values.json === true, yes: values.yes === true });
    }
  } catch (error) {
    console.error(`清理失败：${error.message}`);
    process.exitCode = 1;
  }
}
