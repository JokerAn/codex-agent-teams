import { createHash } from 'node:crypto';
import { accessSync, constants, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const name = 'codex-agent-teams';
const marketplaceName = 'codex-agent-teams-local';
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
const shellQuote = value => `'${value.replaceAll("'", "'\\''")}'`;
const contained = (root, path) => {
  const suffix = relative(root, path);
  return suffix === '' || (!isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith(`..${sep}`));
};

/** Prepare a machine-local package. No install, network access, or model call. */
export function packPlugin({ configPath, out = resolve('dist/local-marketplace'), codexBin }) {
  if (!['darwin', 'linux'].includes(process.platform)) throw new Error('Plugin packaging supports macOS/Linux only; Windows runtime is unsupported');
  const config = loadConfig(configPath, { global: true });
  if (codexBin !== undefined) {
    if (typeof codexBin !== 'string' || !isAbsolute(codexBin)) throw new Error('Codex binary override must be an absolute path');
    config.codexBin = codexBin;
  }
  const root = realpathSync(projectRoot);
  out = resolve(out);
  if (existsSync(out)) throw new Error(`Output already exists; choose a new --out directory: ${out}`);
  // Resolve existing ancestors before making directories, including symlinked parents.
  let ancestor = dirname(out);
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  out = resolve(realpathSync(ancestor), relative(ancestor, out));
  for (const source of ['src', 'skills', 'node_modules']) {
    if (contained(join(root, source), out)) throw new Error(`Output cannot be inside ${source}`);
  }
  const manifest = json(join(root, 'plugin.json'));
  const compatibility = json(join(root, '.codex-plugin/plugin.json'));
  const packageJson = json(join(root, 'package.json'));
  // Agent Plugins v1 discovers ./skills and ./mcp.json by convention. Only
  // the Codex compatibility manifest declares these paths; share metadata.
  if (manifest.name !== name || compatibility.name !== name || manifest.version !== packageJson.version || ['version', 'description'].some(key => compatibility[key] !== manifest[key]) || compatibility.skills !== './skills/' || compatibility.mcpServers !== './.mcp.json') {
    throw new Error('Plugin manifests and package version must agree');
  }
  // Capture only the executable identity, never the builder's full PATH. Build
  // already resolves the desktop fallback; direct pack resolves its own PATH.
  const candidates = isAbsolute(config.codexBin) ? [config.codexBin]
    : (process.env.PATH ?? '').split(delimiter).map(dir => resolve(dir, config.codexBin));
  const executable = candidates.find(path => {
    try { accessSync(path, constants.X_OK); return statSync(path).isFile(); }
    catch { return false; }
  });
  if (!executable) throw new Error(`Codex executable unavailable: ${config.codexBin}; set codexBin to an executable absolute path or use npm run build -- --binary /path/to/codex`);
  config.codexBin = realpathSync(executable);
  const lock = json(join(root, 'package-lock.json'));
  if (lock.lockfileVersion !== 3 || !lock.packages) throw new Error('Expected npm lockfile v3');
  const declared = packageJson.dependencies ?? {};
  const locked = lock.packages['']?.dependencies ?? {};
  if (Object.keys(declared).length !== Object.keys(locked).length || Object.entries(declared).some(([name, version]) => locked[name] !== version || !lock.packages[`node_modules/${name}`] || lock.packages[`node_modules/${name}`].dev)) {
    throw new Error('Runtime dependencies and lockfile must agree; run npm ci first');
  }
  const dependencies = Object.entries(lock.packages).filter(([path, info]) => path && !info.dev);
  for (const [path, info] of dependencies) {
    if (!path.startsWith('node_modules/') || !contained(join(root, 'node_modules'), resolve(root, path)) || info.link) {
      throw new Error(`Unsupported runtime dependency path: ${path}`);
    }
    const installed = join(root, path);
    if (!existsSync(installed)) throw new Error(`Missing runtime dependency ${path}; run npm ci first`);
    if (!lstatSync(installed).isDirectory() || json(join(installed, 'package.json')).version !== info.version) {
      throw new Error(`Runtime dependency differs from lockfile: ${path}; run npm ci first`);
    }
  }
  mkdirSync(dirname(out), { recursive: true });
  const stage = mkdtempSync(join(dirname(out), '.teams-package-'));
  try {
    const pluginRoot = join(stage, 'plugins', name);
    mkdirSync(pluginRoot, { recursive: true });
    for (const path of ['src', 'skills', 'PRINCIPLES.md', 'package.json']) {
      cpSync(join(root, path), join(pluginRoot, path), { recursive: true });
    }
    writeJson(join(pluginRoot, 'plugin.json'), manifest);
    mkdirSync(join(pluginRoot, '.codex-plugin'));
    writeJson(join(pluginRoot, '.codex-plugin/plugin.json'), compatibility);
    for (const [path] of dependencies) cpSync(join(root, path), join(pluginRoot, path), { recursive: true, filter: source => basename(source) !== 'node_modules' });
    const sourceFiles = [...readdirSync(join(root, 'src')).filter(path => path.endsWith('.js')).sort().map(path => `src/${path}`), 'skills/team/SKILL.md', 'package.json'];
    const fingerprint = createHash('sha256');
    for (const path of sourceFiles) { fingerprint.update(path + '\0'); fingerprint.update(readFileSync(join(root, path))); }
    writeJson(join(pluginRoot, 'build-info.json'), { version: packageJson.version, createdAt: new Date().toISOString(), sourceDigest: fingerprint.digest('hex') });
    writeJson(join(pluginRoot, 'teams.config.json'), config);
    // The host supplies its current PATH (including custom dependency tools).
    // Add this exact Node runtime for env-node scripts and verification commands.
    writeFileSync(join(pluginRoot, 'mcp-launch.js'), `import { delimiter, dirname } from 'node:path';\nprocess.env.PATH = [dirname(process.execPath), process.env.PATH].filter(Boolean).join(delimiter);\nawait import('./src/cli.js');\n`);
    // Agent Plugins v1 commands must be bare names or contained ./ paths.
    // Shell expansion finds the sibling without relying on an external dirname.
    writeFileSync(join(pluginRoot, 'mcp-launch'), `#!/bin/sh\nexec ${shellQuote(process.execPath)} "\${0%/*}/mcp-launch.js" "$@"\n`, { mode: 0o755 });
    const args = ['mcp', '--config', 'teams.config.json'];
    const server = { command: './mcp-launch', args, cwd: './' };
    writeJson(join(pluginRoot, 'mcp.json'), {
      $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
      mcpServers: { [name]: { type: 'stdio', ...server } },
    });
    // Older local hosts use the compatibility manifest and .mcp.json.
    writeJson(join(pluginRoot, '.mcp.json'), { mcpServers: { [name]: { ...server, command: process.execPath, args: ['mcp-launch.js', ...args] } } });
    const catalog = join(stage, '.agents', 'plugins');
    mkdirSync(catalog, { recursive: true });
    writeJson(join(catalog, 'marketplace.json'), {
      name: marketplaceName, interface: { displayName: 'Codex Agent Teams (Local)' },
      plugins: [{ name, source: { source: 'local', path: `./plugins/${name}` },
        policy: { installation: 'AVAILABLE', authentication: 'ON_USE' }, category: 'Productivity' }],
    });
    writeFileSync(join(stage, 'README.md'), `# Codex Agent Teams 本机插件\n\n这是跨项目通用的本机插件包，包含运行依赖；没有执行安装或模型调用。\n\n不绑定项目：队长从当前聊天上下文自动传入目标目录，无需用户逐项目配置或重新打包。任务与模型偏好分别保存在各项目。\n\n检查（在实际项目目录执行）：\n\n\`\`\`sh\nnode ${shellQuote(join(out, 'plugins', name, 'src/cli.js'))} doctor --plugin ${shellQuote(out)} --check-thread\n\`\`\`\n\n在支持本地 marketplace 的 Codex 中，手动添加本目录作为来源并安装插件。安装会改写宿主配置；请由用户明确执行。\n\n通用配置或版本变化时生成新目录，再刷新宿主缓存。不要与手工 MCP 配置同时启用，也不要为同一工作区启动多个运行时。\n\n本目录包含 Node/Codex 绝对路径和初始模型配置，面向本机使用，不能作为跨机器分发包。不会保存构建终端的 PATH；启动时继承宿主当前 PATH 并添加打包所用 Node 的目录。自定义依赖命令必须在宿主 PATH 中可见，缺失时预检会拒绝启动。\n`);
    if (existsSync(out)) throw new Error(`Output already exists: ${out}`);
    renameSync(stage, out);
    return { ...pluginTarget(out), runtimeDependencies: dependencies.map(([path]) => path), installed: false, inferenceStarted: false };
  } finally { rmSync(stage, { recursive: true, force: true }); }
}

/** Read only our prepared local marketplace, with paths contained in its root. */
export function pluginTarget(path) {
  const marketplaceRoot = realpathSync(resolve(path));
  const marketplacePath = join(marketplaceRoot, '.agents', 'plugins', 'marketplace.json');
  const catalog = json(marketplacePath);
  const entry = catalog.plugins?.find(plugin => plugin.name === name);
  if (catalog.name !== marketplaceName || entry?.source?.source !== 'local' || typeof entry.source.path !== 'string') {
    throw new Error('Expected a prepared Codex Agent Teams local marketplace');
  }
  const pluginRoot = realpathSync(resolve(marketplaceRoot, entry.source.path));
  if (!contained(marketplaceRoot, pluginRoot)) throw new Error('Plugin path escapes marketplace root');
  return { marketplaceRoot, marketplacePath, pluginRoot, pluginName: name, configPath: join(pluginRoot, 'teams.config.json') };
}
