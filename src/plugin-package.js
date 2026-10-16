import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const name = 'codex-agent-teams', marketplaceName = 'codex-agent-teams-local';
const numericVersion = '(?:0|[1-9]\\d*)';
const prerelease = `(?:${numericVersion}|\\d*[A-Za-z-][0-9A-Za-z-]*)`;
const releaseVersion = new RegExp(`^${numericVersion}\\.${numericVersion}\\.${numericVersion}(?:-${prerelease}(?:\\.${prerelease})*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`);
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
const contained = (root, path) => {
  const suffix = relative(root, path);
  return suffix === '' || (!isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith(`..${sep}`));
};

/** Native default: only instructions and metadata, no config, deps or subprocess. */
export function packNativePlugin({ out = resolve('dist/local-marketplace') } = {}) {
  const root = realpathSync(sourceRoot);
  const skillPath = 'skills/team/SKILL.md';
  for (const path of ['skills', 'skills/team', skillPath]) {
    const stat = lstatSync(join(root, path));
    if (stat.isSymbolicLink() || (path === skillPath ? !stat.isFile() : !stat.isDirectory())) {
      throw new Error(`Native skill source must use regular files/directories without a symbolic link: ${path}`);
    }
  }
  const skill = readFileSync(join(root, skillPath));
  out = resolve(out);
  if (existsSync(out)) throw new Error(`Output already exists; choose a new --out directory: ${out}`);
  let ancestor = dirname(out);
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  out = resolve(realpathSync(ancestor), relative(ancestor, out));
  for (const directory of ['src', 'skills', 'node_modules']) {
    if (contained(join(root, directory), out)) throw new Error(`Output cannot be inside ${directory}`);
  }
  const manifest = json(join(root, '.codex-plugin/plugin.json')), portable = json(join(root, 'plugin.json')), pkg = json(join(root, 'package.json'));
  if (typeof pkg.version !== 'string' || pkg.version !== pkg.version.trim() || !releaseVersion.test(pkg.version)
    || [pkg.name, pkg.description, manifest.description].some(value => typeof value !== 'string' || !value.trim())) {
    throw new Error('Native plugin metadata requires a valid SemVer version and nonempty name/description');
  }
  const unsupported = Object.keys(manifest).filter(key => !['name', 'version', 'description', 'skills'].includes(key));
  if (unsupported.length) {
    throw new Error(`Native plugin manifest contains unsupported fields: ${unsupported.join(', ')}`);
  }
  if (manifest.name !== name || portable.name !== name || manifest.version !== pkg.version || portable.version !== pkg.version || manifest.description !== portable.description
    || manifest.skills !== './skills/' || manifest.mcpServers || manifest.hooks || portable.extensions?.['com.openai']?.hooks) throw new Error('Native plugin manifests and package version must agree without MCP or hooks');
  mkdirSync(dirname(out), { recursive: true });
  const stage = mkdtempSync(join(dirname(out), '.teams-package-'));
  try {
    const pluginRoot = join(stage, 'plugins', name);
    mkdirSync(join(pluginRoot, '.codex-plugin'), { recursive: true });
    mkdirSync(join(pluginRoot, 'skills', 'team'), { recursive: true });
    writeJson(join(pluginRoot, '.codex-plugin/plugin.json'), manifest);
    writeJson(join(pluginRoot, 'package.json'), { name: pkg.name, version: pkg.version, private: true, description: pkg.description });
    writeFileSync(join(pluginRoot, skillPath), skill);
    const fingerprint = createHash('sha256');
    for (const file of ['.codex-plugin/plugin.json', 'package.json', 'skills/team/SKILL.md']) { fingerprint.update(file + '\0'); fingerprint.update(readFileSync(join(pluginRoot, file))); }
    writeJson(join(pluginRoot, 'build-info.json'), { version: pkg.version, mode: 'native', createdAt: new Date().toISOString(), sourceDigest: fingerprint.digest('hex') });
    mkdirSync(join(stage, '.agents', 'plugins'), { recursive: true });
    writeJson(join(stage, '.agents/plugins/marketplace.json'), {
      name: marketplaceName, interface: { displayName: 'Codex Agent Teams (Native)' },
      plugins: [{ name, source: { source: 'local', path: `./plugins/${name}` }, policy: { installation: 'AVAILABLE', authentication: 'ON_USE' }, category: 'Productivity' }],
    });
    if (existsSync(out)) throw new Error(`Output already exists: ${out}`);
    renameSync(stage, out);
    return { ...pluginTarget(out), mode: 'native', manifestFormat: 'codex-compatibility', runtimeDependencies: [], installed: false, inferenceStarted: false };
  } finally { rmSync(stage, { recursive: true, force: true }); }
}

/** Read the prepared local marketplace; never select a project from package cwd. */
export function pluginTarget(path) {
  const marketplaceRoot = realpathSync(resolve(path)), marketplacePath = join(marketplaceRoot, '.agents', 'plugins', 'marketplace.json');
  const catalog = json(marketplacePath), entry = catalog.plugins?.find(plugin => plugin.name === name);
  if (catalog.name !== marketplaceName || entry?.source?.source !== 'local' || typeof entry.source.path !== 'string') throw new Error('Expected a prepared Codex Agent Teams local marketplace');
  const pluginRoot = realpathSync(resolve(marketplaceRoot, entry.source.path));
  if (!contained(marketplaceRoot, pluginRoot)) throw new Error('Plugin path escapes marketplace root');
  const configPath = join(pluginRoot, 'teams.config.json');
  const buildPath = join(pluginRoot, 'build-info.json');
  return { marketplaceRoot, marketplacePath, pluginRoot, pluginName: name,
    mode: existsSync(buildPath) ? json(buildPath).mode ?? 'strict' : 'strict',
    ...(existsSync(configPath) ? { configPath } : {}) };
}
