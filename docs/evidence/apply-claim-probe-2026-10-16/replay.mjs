import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const recorded = JSON.parse(readFileSync(join(here, 'results.json'), 'utf8'));
const source = process.argv[2] || recorded.baseline.business;
assert(Number(process.versions.node.split('.')[0]) >= 24, 'Use Node.js 24+');
for (const [file, expected] of Object.entries(recorded.baseline.sourceHashes)) {
  const actual = createHash('sha256').update(readFileSync(join(source, file))).digest('hex');
  assert.equal(actual, expected, `Source changed since measurement: ${file}`);
}
const work = mkdtempSync(join(tmpdir(), 'teams-probe-replay-'));
const plans = [
  { arm: 'serial-high', scope: 'both', tests: 12 },
  { arm: 'parallel-high', scope: 'both', tests: 12 },
  { arm: 'pickup-low', scope: 'pickup', tests: 5 },
  { arm: 'shared-writer', scope: 'pickup', tests: 7, dirty: true },
  { arm: 'tiny-direct', scope: 'date', tests: 6 }
];
const results = [];
try {
  for (const plan of plans) {
    const armRoot = join(work, plan.arm);
    for (const file of Object.keys(recorded.baseline.sourceHashes)) {
      mkdirSync(dirname(join(armRoot, file)), { recursive: true });
      copyFileSync(join(source, file), join(armRoot, file));
    }
    const apply = spawnSync('git', ['apply', join(here, 'patches', `${plan.arm}.patch`)], { cwd: armRoot, encoding: 'utf8' });
    assert.equal(apply.status, 0, apply.stderr || apply.error?.message);
    for (const tz of ['UTC', 'Asia/Shanghai', 'America/Los_Angeles']) {
      const env = { ...process.env, TZ: tz, PROBE_ROOT: armRoot, PROBE_SCOPE: plan.scope, PROBE_DIRTY: plan.dirty ? '1' : '0' };
      delete env.NODE_TEST_CONTEXT;
      const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', join(here, 'captain/acceptance.cjs')], { env, encoding: 'utf8', timeout: 10000 });
      const tests = Number(run.stdout.match(/# tests (\d+)/)?.[1]);
      const pass = Number(run.stdout.match(/# pass (\d+)/)?.[1]);
      assert.equal(run.status, 0, run.stdout + run.stderr + (run.error?.message || ''));
      assert.equal(tests, plan.tests);
      assert.equal(pass, plan.tests);
      results.push({ arm: plan.arm, tz, exit: run.status, tests, pass });
    }
  }
  console.log(JSON.stringify({ at: new Date().toISOString(), node: process.version, execPath: process.execPath, behaviorExecutions: results.reduce((n, row) => n + row.tests, 0), results }, null, 2));
} finally {
  rmSync(work, { recursive: true, force: true });
}
