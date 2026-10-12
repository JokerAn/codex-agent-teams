import { accessSync, constants, statSync } from 'node:fs';
import { delimiter, isAbsolute, join, resolve } from 'node:path';
import { homedir } from 'node:os';

const desktopCandidates = process.platform === 'darwin'
  ? ['/Applications', join(homedir(), 'Applications')].flatMap(root => [
    join(root, 'Codex.app/Contents/Resources/codex'),
    join(root, 'ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex'),
  ]) : [];

/** Resolve before bootstrap; this module deliberately needs no npm dependencies. */
export function resolveCodexBin(binary = 'codex', { cwd = process.cwd(), path = process.env.PATH ?? '', desktop = desktopCandidates } = {}) {
  if (typeof binary !== 'string' || !binary.trim()) throw new Error('codexBin 必须是有效命令或可执行文件路径。');
  const explicit = isAbsolute(binary) || /[\\/]/.test(binary);
  const candidates = explicit ? [resolve(cwd, binary)] : [
    ...path.split(delimiter).map(dir => resolve(cwd, dir, binary)),
    ...(binary === 'codex' ? desktop : []),
  ];
  for (const candidate of candidates) {
    try {
      if (!statSync(candidate).isFile()) continue;
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch { /* Try the next known location; never replace an explicit path. */ }
  }
  throw new Error(`找不到可执行的 Codex CLI：${binary}。请设置 teams.local.json 的 codexBin 为实际绝对路径，或通过 npm run build -- --binary /完整路径/codex 指定。尚未安装依赖或打包。`);
}
