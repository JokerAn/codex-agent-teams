import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// This is a controlled CLI simulation with real cache copies. It neither installs
// a plugin in Codex nor starts inference or an App Server.
assert.ok(Number(process.versions.node.split('.')[0]) >= 24, 'Use Node.js 24 or newer');
const plugin = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { packNativePlugin, pluginTarget } = await import(pathToFileURL(join(plugin, 'src/plugin-package.js')));
const { installPreparedPlugin } = await import(pathToFileURL(join(plugin, 'scripts/update.js')));
const root = mkdtempSync(join(tmpdir(), 'teams-082-update-probe-'));
const marketName = 'codex-agent-teams-local';
const selector = `codex-agent-teams@${marketName}`;
const json = file => JSON.parse(readFileSync(file, 'utf8'));
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const results = [];

async function run(name, { extraSkill = false, failAfterCopy = false, upgrading = false } = {}) {
  const path = join(root, name);
  mkdirSync(path);
  const packed = packNativePlugin({ out: join(path, 'candidate') });
  const cache = join(path, 'cache');
  let previous;
  let current;
  let installed;
  let oldSkill;
  if (upgrading) {
    const oldMarket = join(path, 'old-marketplace');
    cpSync(packed.marketplaceRoot, oldMarket, { recursive: true });
    const oldRoot = pluginTarget(oldMarket).pluginRoot;
    for (const file of ['package.json', '.codex-plugin/plugin.json']) {
      writeJson(join(oldRoot, file), { ...json(join(oldRoot, file)), version: '0.8.1' });
    }
    oldSkill = readFileSync(join(oldRoot, 'skills/team/SKILL.md'), 'utf8') + '\nOld fixture byte marker.\n';
    writeFileSync(join(oldRoot, 'skills/team/SKILL.md'), oldSkill);
    const hash = createHash('sha256');
    for (const file of ['.codex-plugin/plugin.json', 'package.json', 'skills/team/SKILL.md']) {
      hash.update(file + '\0');
      hash.update(readFileSync(join(oldRoot, file)));
    }
    writeJson(join(oldRoot, 'build-info.json'), { ...json(join(oldRoot, 'build-info.json')), version: '0.8.1', sourceDigest: hash.digest('hex') });
    previous = { name: marketName, root: oldMarket, marketplaceSource: { sourceType: 'local', source: oldMarket } };
    current = previous;
    cpSync(oldRoot, cache, { recursive: true });
    installed = { pluginId: selector, version: '0.8.1', enabled: true, installedPath: cache };
    assert.notEqual(oldSkill, readFileSync(join(packed.pluginRoot, 'skills/team/SKILL.md'), 'utf8'));
  }
  let failed = false;
  const calls = [];
  const command = args => {
    calls.push(args);
    if (args[1] === 'marketplace') {
      if (args[2] === 'list') {
        return { marketplaces: current ? [current] : [] };
      }
      if (args[2] === 'remove') {
        current = undefined;
        return {};
      }
      current = { name: marketName, root: args[3], marketplaceSource: { sourceType: 'local', source: args[3] } };
      return {};
    }
    if (args[1] === 'list') {
      return { installed: installed ? [installed] : [] };
    }
    if (args[1] === 'remove') {
      rmSync(cache, { recursive: true, force: true });
      installed = undefined;
      return {};
    }
    if (args[1] === 'add') {
      const source = pluginTarget(current.root).pluginRoot;
      rmSync(cache, { recursive: true, force: true });
      cpSync(source, cache, { recursive: true });
      installed = { pluginId: selector, version: json(join(cache, 'package.json')).version, enabled: true, installedPath: cache };
      if (extraSkill) {
        mkdirSync(join(cache, 'skills/old-runtime'), { recursive: true });
        writeFileSync(join(cache, 'skills/old-runtime/SKILL.md'), '---\nname: old-runtime\ndescription: stale instructions\n---\nOld instructions.\n');
      }
      if (failAfterCopy && !failed && current.root === packed.marketplaceRoot) {
        failed = true;
        throw new Error('Injected failure after copying new cache');
      }
      return { installedPath: cache };
    }
    throw new Error(`Unexpected command: ${JSON.stringify(args)}`);
  };
  let result;
  let error;
  try {
    result = await installPreparedPlugin({ binary: process.execPath, marketplaceRoot: packed.marketplaceRoot,
      workspace: join(path, 'unused-workspace'), codexHome: join(path, 'unused-home'), command });
  } catch (failure) {
    error = failure.message;
  }
  if (failAfterCopy) {
    assert.match(error, /Injected failure[\s\S]*安装状态已恢复/);
    assert.equal(installed.version, '0.8.1');
    assert.equal(readFileSync(join(cache, 'skills/team/SKILL.md'), 'utf8'), oldSkill);
    assert.deepEqual(current, previous);
  } else {
    assert.equal(error, undefined);
    assert.equal(result.version, json(join(plugin, 'package.json')).version);
    assert.equal(readFileSync(join(cache, 'skills/team/SKILL.md'), 'utf8'), readFileSync(join(packed.pluginRoot, 'skills/team/SKILL.md'), 'utf8'));
  }
  const skills = readdirSync(join(cache, 'skills')).sort();
  if (extraSkill) {
    assert.deepEqual(skills, ['old-runtime', 'team']);
  } else {
    assert.deepEqual(skills, ['team']);
  }
  results.push({ name, accepted: Boolean(result), error: error ?? null, installedVersion: installed.version,
    skills, distinctOldNewBytes: upgrading, mutations: calls.filter(args => !args.includes('list')).length });
}

try {
  await run('clean-fresh');
  await run('extra-skill-accepted', { extraSkill: true });
  await run('distinct-version-update', { upgrading: true });
  await run('distinct-version-rollback', { upgrading: true, failAfterCopy: true });
  console.log(JSON.stringify({ node: process.version, evidence: 'controlled CLI with real file copies', results }, null, 2));
} finally {
  rmSync(root, { recursive: true, force: true });
}
