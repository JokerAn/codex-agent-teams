import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { configSchema } from './contracts.js';

export function loadConfig(path, { global = false } = {}) {
  if (!path) throw new Error('Provide --config /absolute/path/teams.local.json (see examples/teams.config.json)');
  const configPath = realpathSync(resolve(path));
  const config = configSchema.parse(JSON.parse(readFileSync(configPath, 'utf8')));
  // New plugin packages are reusable across projects; retain fixed targets only for old direct CLI/MCP configs.
  if (global) delete config.workspace;
  else if (config.workspace) {
    config.workspace = realpathSync(resolve(dirname(configPath), config.workspace));
    if (!statSync(config.workspace).isDirectory()) throw new Error('workspace must be a directory');
  }
  if (!isAbsolute(config.codexBin) && /[\\/]/.test(config.codexBin)) config.codexBin = resolve(dirname(configPath), config.codexBin);
  for (const profile of Object.values(config.profiles)) {
    if (profile.model.startsWith('REPLACE_')) throw new Error('Configure a real available model; run doctor first.');
  }
  return config;
}

/** CLI can use its actual working directory. A plugin MCP must receive the chat target explicitly. */
export function configForWorkspace(config, workspace) {
  const requested = workspace ?? config.workspace ?? process.cwd();
  if (!isAbsolute(requested)) throw new Error('workspace must be an absolute path');
  const root = realpathSync(requested);
  if (!statSync(root).isDirectory()) throw new Error('workspace must be a directory');
  if (config.workspace && config.workspace !== root) throw new Error(`Target workspace mismatch: expected ${root}; configured ${config.workspace}`);
  return { ...config, workspace: root };
}
