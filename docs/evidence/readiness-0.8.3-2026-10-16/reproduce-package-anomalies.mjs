// Reproduces known 0.8.3 defects. Exit 0 means the defect was observed. Uses only temporary Codex homes; no model inference.
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { packNativePlugin } from '../../../src/plugin-package.js';
import { installPreparedPlugin } from '../../../scripts/update.js';
const base = mkdtempSync(join(tmpdir(), 'teams-readiness-update-repro-'));
const self = fileURLToPath(import.meta.url);
const binary = process.env.TEAMS_AUDIT_CODEX_BIN ?? execFileSync('which', ['codex'], { encoding: 'utf8' }).trim();
const runRoot = mkdtempSync(join(base, 'official-anomalies-'));
const results = [];
for (const anomaly of ['manifest-version-mismatch', 'unknown-mode']) {
  const root = join(runRoot, anomaly); mkdirSync(root);
  const home = join(root, 'home'); mkdirSync(home);
  const workspace = join(root, 'workspace'); mkdirSync(workspace);
  const packed = packNativePlugin({ out: join(root, 'candidate') });
  const json = path => JSON.parse(readFileSync(path, 'utf8'));
  const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
  if (anomaly === 'manifest-version-mismatch') {
    const manifest = join(packed.pluginRoot, '.codex-plugin/plugin.json');
    save(manifest, { ...json(manifest), version: '99.0.0' });
  } else {
    const build = join(packed.pluginRoot, 'build-info.json'); save(build, { ...json(build), mode: 'native-typo' });
    mkdirSync(join(packed.pluginRoot, 'src')); writeFileSync(join(packed.pluginRoot, 'extra-runtime.js'), '// unexpected runtime marker; never imported\n');
  }
  const command = args => {
    const stdout = execFileSync(binary, args, { cwd: workspace, env: { ...process.env, CODEX_HOME: home }, encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
    writeFileSync(join(root, 'commands.jsonl'), JSON.stringify({ args, stdout }) + '\n', { flag: 'a' });
    return JSON.parse(stdout);
  };
  let result, error;
  try { result = await installPreparedPlugin({ binary, marketplaceRoot: packed.marketplaceRoot, workspace, codexHome: home, command }); }
  catch (failure) { error = failure.message; }
  const installed = command(['plugin', 'list', '--marketplace', 'codex-agent-teams-local', '--json']).installed;
  const outcome = { anomaly, result, error, installed };
  results.push(outcome); save(join(root, 'result.json'), outcome); console.log(JSON.stringify(outcome));
}
writeFileSync(join(runRoot, 'results.json'), JSON.stringify(results, null, 2) + '\n');

console.log(JSON.stringify({ evidence: join(runRoot, 'results.json') }));
