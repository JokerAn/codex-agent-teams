// Manual negative control. Real Node processes, no model or network calls.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixtureNode } from '../../../tests/fixtures/coverage.js';

const root = mkdtempSync(join(tmpdir(), 'teams-coverage-write-race-'));
const cases = [];
for (const isolated of [false, true]) {
  const source = `const vm=require('node:vm');const v8=require('node:v8');
vm.runInThisContext(Array.from({length:100000},(_,i)=>'function generated'+i+'(){return '+i+';}').join('\\n'));
console.log('ready');v8.takeCoverage();setInterval(()=>{},1000);`;
  const launch = isolated ? fixtureNode(['-e', source]) : { command: process.execPath, args: ['-e', source] };
  const file = join(root, isolated ? 'isolated.test.mjs' : 'unisolated.test.mjs');
  writeFileSync(file, `import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {watch,readdirSync,readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
test('intentional kill preserves valid coverage inputs only when fixture collection is stopped',async()=>{
  const directory=process.env.NODE_V8_COVERAGE;
  let child,killTimer,hitWrite=false;
  const watcher=watch(directory,(_event,file)=>{
    if(child&&String(file).startsWith('coverage-'+child.pid+'-')&&!hitWrite){hitWrite=true;child.kill('SIGKILL');}
  });
  try {
    child=spawn(${JSON.stringify(launch.command)},${JSON.stringify(launch.args)},{env:process.env,stdio:['ignore','pipe','pipe']});
    child.stdout.on('data',()=>{killTimer??=setTimeout(()=>child.kill('SIGKILL'),2000);});
    let stderr='';child.stderr.on('data',data=>stderr+=data);
    await once(child,'close');
    const files=readdirSync(directory).filter(file=>file.startsWith('coverage-'+child.pid+'-'));
    const invalid=[];
    for(const file of files){try{JSON.parse(readFileSync(join(directory,file),'utf8'));}catch(error){invalid.push({file,bytes:statSync(join(directory,file)).size,error:error.message});}}
    console.log(JSON.stringify({isolated:${isolated},hitWrite,files:files.length,invalid,stderr:stderr.slice(-500)}));
    ${isolated ? 'assert.equal(files.length,0);assert.equal(invalid.length,0);' : 'assert(hitWrite);assert(invalid.length);'}
  } finally {clearTimeout(killTimer);watcher.close();}
});
`);
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', '--experimental-test-coverage', file], {
    encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024,
  });
  writeFileSync(join(root, isolated ? 'isolated.tap' : 'unisolated.tap'), result.stdout + result.stderr);
  assert.equal(result.status, isolated ? 0 : 1, result.stdout + result.stderr);
  assert.match(result.stdout, /# tests 1/); assert.match(result.stdout, /# pass 1/); assert.match(result.stdout, /# fail 0/);
  if (isolated) assert.doesNotMatch(result.stdout, /Could not report code coverage/);
  else assert.match(result.stdout, /Could not report code coverage/);
  cases.push({ isolated, testPass: 1, testFail: 0, exitCode: result.status, coverageReported: isolated });
}
const result = { node: process.version, platform: process.platform, root, cases, inferenceStarted: false };
writeFileSync(join(root, 'results.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
