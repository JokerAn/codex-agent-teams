import { readFileSync, realpathSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { configSchema } from './contracts.js';

export function loadConfig(path) {
  if (!path) throw new Error('Provide --config /absolute/path/teams.local.json (see examples/teams.config.json)');
  const config = configSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  config.workspace = realpathSync(resolve(config.workspace));
  if (!statSync(config.workspace).isDirectory()) throw new Error('workspace must be a directory');
  for (const profile of Object.values(config.profiles)) {
    if (profile.model.startsWith('REPLACE_')) throw new Error('Configure a real available model; run doctor first.');
  }
  return config;
}
