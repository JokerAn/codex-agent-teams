import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { resolveCodexBin } from './codex-bin.js';

const root = fileURLToPath(new URL('../', import.meta.url));

try {
  if (!['darwin', 'linux'].includes(process.platform)) throw new Error('构建仅支持 macOS/Linux；Windows 运行时尚不支持。可继续只读查看源码。');
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('需要 Node.js 24 或更新版本。');
  const { values } = parseArgs({ options: { config: { type: 'string' }, out: { type: 'string' }, binary: { type: 'string' } } });
  const explicitConfig = values.config ?? process.env.TEAMS_CONFIG;
  const configPath = resolve(root, explicitConfig ?? 'teams.local.json');
  if (explicitConfig && !existsSync(configPath)) throw new Error(`指定的配置不存在：${configPath}`);
  const existingConfig = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : null;
  const codexBin = resolveCodexBin(values.binary ?? existingConfig?.codexBin ?? 'codex', {
    cwd: values.binary ? process.cwd() : dirname(configPath),
  });
  console.log(`Codex CLI：${codexBin}`);

  console.log('安装锁定依赖（npm ci --ignore-scripts）…');
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error('请通过 npm run build 运行。');
  const install = spawnSync(process.execPath, [npm, 'ci', '--ignore-scripts'], { cwd: root, stdio: 'inherit' });
  if (install.error) throw install.error;
  if (install.status !== 0) throw new Error(`依赖安装失败：${install.signal ?? install.status}`);

  // Import after bootstrap so a fresh checkout needs only npm run build.
  const { CodexBackend } = await import('../src/app-server.js');
  const { loadConfig } = await import('../src/config.js');
  const { packPlugin, pluginTarget } = await import('../src/plugin.js');
  if (!existsSync(configPath)) {
    console.log('读取 Codex 默认模型，准备本机配置（不启动推理）…');
    const host = await new CodexBackend({ binary: codexBin }).probe(root, { modelSettings: true });
    const model = host.configuredModel ? host.models.find(candidate => candidate.model === host.configuredModel) : host.models.find(candidate => candidate.default);
    if (!model || !model.efforts.includes('high')) {
      throw new Error('Codex 默认模型不可用或不支持 high；请在 teams.local.json 配置可用的强模型，参见 examples/teams.config.json。');
    }
    const config = {
      codexBin, maxConcurrency: 2, taskTimeoutMs: 600000,
      profiles: { expert: { model: model.model, effort: 'high' } },
    };
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
    console.log(`已生成配置：${configPath}\n候选强模型：${model.model} / high；首次启动成员前仍需用户确认团队模型分工。`);
  }
  const config = loadConfig(configPath, { global: true });
  config.codexBin = codexBin;
  console.log(`项目：随当前聊天自动选择（全项目通用）\n模型：${config.profiles.expert.model} / ${config.profiles.expert.effort ?? '默认'}`);
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const base = join(root, 'dist', `marketplace-v${version}`);
  const out = values.out ? resolve(root, values.out) : existsSync(base) ? `${base}-${Date.now()}` : base;
  console.log('打包插件及生产依赖…');
  packPlugin({ configPath, out, codexBin });
  console.log('检查包内插件、模型和只读线程权限（不启动推理）…');
  await new CodexBackend({ binary: config.codexBin }).probe(root, {
    profiles: config.profiles, plugin: pluginTarget(out), checkThread: true,
  });
  console.log(`\n构建与检查通过。Codex「添加插件市场」填写：\n\n来源：${out}\nGit 引用：留空\n稀疏路径：留空\n\n添加市场后安装 codex-agent-teams。已有安装需重装以更新缓存。\n本命令没有安装插件到 Codex，也没有启动模型推理。`);
} catch (error) {
  console.error(`\n构建失败：${error.message}`);
  process.exitCode = 1;
}
