import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

assert.ok(Number(process.versions.node.split('.')[0]) >= 24, 'Use Node.js 24 or newer');
const evidence = dirname(fileURLToPath(import.meta.url));
const business = resolve(process.argv[2] ?? '/Users/anshunli1/jd/jdGit/product/web/apply-claim');
const source = readFileSync(join(business, 'src/views/apply/components/pickup-time.js'));
assert.equal(createHash('sha256').update(source).digest('hex'),
  '3e581f0d35c0caacb388ec7d9aa585bb9a3954ce146dcd6a396d89b4903428b4',
  'Business source changed; this historical experiment needs the recorded baseline');
const root = mkdtempSync(join(tmpdir(), 'teams-082-replay-'));
const results = [];
try {
  for (const file of ['acceptance.mjs', 'summary.mjs', 'pickup-time.mjs']) {
    cpSync(join(evidence, file), join(root, file));
  }
  writeFileSync(join(root, 'baseline.mjs'), source);
  const run = (label, module, tz) => {
    const env = { ...process.env, TZ: tz, PROBE_MODULE: join(root, module) };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath,
      ['--test', '--test-reporter=tap', join(root, 'acceptance.mjs')],
      { env, encoding: 'utf8', timeout: 10000 });
    assert.ifError(result.error);
    const text = result.stdout + result.stderr;
    const count = name => Number(text.match(new RegExp(`^# ${name} (\\d+)`, 'm'))?.[1] ?? -1);
    const row = { label, tz, exit: result.status, tests: count('tests'), pass: count('pass'), fail: count('fail'), skipped: count('skipped') };
    results.push(row);
    assert.equal(row.tests, 9, text);
    assert.equal(row.skipped, 0, text);
    if (label === 'enhanced') {
      assert.equal(row.exit, 0, text);
      assert.equal(row.pass, 9, text);
      assert.equal(row.fail, 0, text);
    } else {
      assert.equal(row.exit, 1, text);
      assert.equal(row.pass, 4, text);
      assert.equal(row.fail, 5, text);
    }
  };
  for (const tz of ['UTC', 'Asia/Shanghai', 'America/Los_Angeles']) {
    run('enhanced', 'pickup-time.mjs', tz);
  }
  run('negative-original', 'baseline.mjs', 'Asia/Shanghai');
  console.log(JSON.stringify({ node: process.version, results }, null, 2));
} finally {
  rmSync(root, { recursive: true, force: true });
}
