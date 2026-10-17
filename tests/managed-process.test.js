import { fixtureNode } from './fixtures/coverage.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { processAlive } from '../src/store.js';
import { signalGroup } from '../src/process-group.js';

for (const kind of ['member', 'verification']) test(`SIGKILL runtime reaps guarded ${kind} and its TERM-ignoring descendant`, { timeout: 10000 }, async t => {
  const root = mkdtempSync(join(tmpdir(), 'teams-orphan-test-')), marker = join(root, 'descendant.pid');
  const managed = new URL('../src/managed-process.js', import.meta.url).href;
  const verify = new URL('../src/verification.js', import.meta.url).href;
  // Grandchild inherits the guard's group but ignores TERM. No model or network.
  const descendant = `require('node:fs').writeFileSync(${JSON.stringify(marker)},String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`;
  const command = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:'inherit'});process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`;
  const executable = fixtureNode(['-e', command]);
  const code = kind === 'member' ? `
    import {spawnManaged} from ${JSON.stringify(managed)};
    const child=spawnManaged(${JSON.stringify(executable.command)},${JSON.stringify(executable.args)},{stdio:['pipe','pipe','pipe']});
    child.on('error',()=>{});child.stdout.resume();child.stderr.resume();process.send({pid:child.pid});
  ` : `
    import {runVerification} from ${JSON.stringify(verify)};
    await runVerification({...${JSON.stringify(executable)},timeoutMs:60000},
      {cwd:${JSON.stringify(root)},logDir:${JSON.stringify(join(root, 'logs'))},onSpawn:({childPid})=>process.send({pid:childPid})});
  `;
  const parent = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  let group, errors = ''; parent.stderr.on('data', chunk => { errors += chunk; });
  t.after(async () => {
    parent.kill('SIGKILL');
    if (group && processAlive(group, true)) signalGroup(group, 'SIGKILL');
    rmSync(root, { recursive: true, force: true });
  });
  group = await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error(errors || 'No guarded launch')), 3000); parent.once('message', message => { clearTimeout(timer); resolve(message.pid); }); });
  let until = Date.now() + 3000;
  while (!existsSync(marker) && Date.now() < until) await delay(20);
  assert(existsSync(marker), errors);
  const pid = Number(readFileSync(marker, 'utf8'));
  assert(processAlive(pid));
  parent.kill('SIGKILL');
  until = Date.now() + 3000;
  while ((processAlive(group, true) || processAlive(pid)) && Date.now() < until) await delay(25);
  assert.equal(processAlive(group, true), false, 'guarded group must exit after runtime death');
  assert.equal(processAlive(pid), false, 'TERM-ignoring descendant must exit');
});
