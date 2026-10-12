// No inference. Verify the installed host's filesystem/network enforcement in a temporary home.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { binary: { type: 'string', default: 'codex' } } });
const root = realpathSync(mkdtempSync(join(tmpdir(), 'teams-sandbox-'))), source = join(root, 'source'), home = join(root, 'home'), member = join(root, 'member');
mkdirSync(source); mkdirSync(home);
const git = args => execFileSync('git', ['-C', source, ...args], { stdio: 'pipe' });
try {
  git(['init']); git(['config', 'user.name', 'Sandbox fixture']); git(['config', 'user.email', 'fixture@localhost']);
  writeFileSync(join(source, 'proof.txt'), 'source original'); git(['add', '.']); git(['commit', '-m', 'fixture']);
  git(['worktree', 'add', '--detach', member, 'HEAD']);
  const commonConfig = execFileSync('git', ['-C', source, 'rev-parse', '--git-path', 'config'], { stdio: 'pipe', encoding: 'utf8' }).trim();
  writeFileSync(join(home, 'config.toml'), '[permissions.teams_probe]\nextends=":read-only"\n[permissions.teams_probe.filesystem.":workspace_roots"]\n"."="write"\n[permissions.teams_probe.network]\nenabled=false\n');
  const code = `const fs=require('node:fs'),net=require('node:net');fs.writeFileSync('inside.txt','allowed');
const denied=path=>{try{fs.writeFileSync(path,'forbidden');return false}catch(e){return ['EPERM','EACCES'].includes(e.code)}};
const results={inside:fs.existsSync('inside.txt'),sourceDenied:denied(${JSON.stringify(join(source, 'proof.txt'))}),outsideDenied:denied('../outside.txt'),gitFileDenied:denied('.git'),gitConfigDenied:denied(${JSON.stringify(join(source, commonConfig))})};
const server=net.createServer();server.on('error',e=>{results.networkDenied=['EPERM','EACCES'].includes(e.code);finish()});server.listen(0,'127.0.0.1',()=>{results.networkDenied=false;server.close(finish)});
function finish(){console.log(JSON.stringify(results));if(Object.values(results).some(v=>v!==true))process.exit(9)}`;
  const result = JSON.parse(execFileSync(values.binary, ['sandbox', '-P', 'teams_probe', '-C', member, '--', process.execPath, '-e', code], {
    env: { ...process.env, CODEX_HOME: home }, encoding: 'utf8', stdio: 'pipe', timeout: 15000,
  }));
  for (const key of ['inside', 'sourceDenied', 'outsideDenied', 'gitFileDenied', 'gitConfigDenied', 'networkDenied']) assert.equal(result[key], true, key);
  assert.equal(existsSync(join(root, 'outside.txt')), false);
  console.log(JSON.stringify({ ...result, inferenceStarted: false, userConfigChanged: false,
    scope: 'Installed Codex named read-only-derived workspace profile, temporary linked worktree; actual filesystem and local network syscalls. App Server legacy write echo is checked separately.' }, null, 2));
} finally { rmSync(root, { recursive: true, force: true }); }
