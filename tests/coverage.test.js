import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as coverage from './fixtures/coverage.js';

const fakeServer = fileURLToPath(new URL('./fixtures/fake-app-server.js', import.meta.url));
const fakeServerUrl = new URL('./fixtures/fake-app-server.js', import.meta.url).href;
const helperUrl = new URL('./fixtures/coverage.js', import.meta.url).href;
const guardUrl = new URL('../src/process-guard.js', import.meta.url).href;
const appServerUrl = new URL('../src/app-server.js', import.meta.url).href;

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'teams-fixture-coverage-')));
  const workerEnv = { ...process.env };
  t.after(() => {
    rmSync(root, { recursive: true, force: true });
    assert.deepEqual({ ...process.env }, workerEnv, 'test worker environment must remain unchanged');
  });
  const directory = join(root, 'coverage');
  mkdirSync(directory);
  return { root, directory, env: { ...process.env, NODE_V8_COVERAGE: directory } };
}

function run(f, args, { command = process.execPath, status = 0, ...options } = {}) {
  const result = spawnSync(command, args, { env: f.env, timeout: 15000, ...options });
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stderr?.toString());
  assert.equal(result.status, status, result.stderr?.toString());
  return result;
}

function exactOutput(result, stdout = '', stderr = '') {
  assert.deepEqual(result.stdout, Buffer.from(stdout), 'stdout bytes must remain unchanged');
  assert.deepEqual(result.stderr, Buffer.from(stderr), 'stderr bytes must remain unchanged');
}

const profiles = f => readdirSync(f.directory).filter(name => /^coverage-.*\.json$/.test(name));
const nodeFixture = (f, args, options = {}) => {
  const target = coverage.fixtureNode(args);
  return run(f, target.args, { ...options, command: target.command });
};

// Keep a positive control: a real Node caller must still collect coverage.
test('importing fixture helpers preserves caller coverage and exact output', t => {
  const f = fixture(t);
  const code = `
    const before = process.env.NODE_V8_COVERAGE;
    await import(${JSON.stringify(helperUrl)});
    if (process.env.NODE_V8_COVERAGE !== before) throw new Error('caller environment changed');
    process.stdout.write('caller-out');process.stderr.write('caller-err');
  `;
  exactOutput(run(f, ['--input-type=module', '-e', code]), 'caller-out', 'caller-err');
  assert.equal(profiles(f).length, 1);
  const profile = JSON.parse(readFileSync(join(f.directory, profiles(f)[0]), 'utf8'));
  assert.ok(profile.result.some(script => script.url === helperUrl));
});

test('fixtureEnv clones custom and default environments and preserves binary output', t => {
  const f = fixture(t), before = { ...f.env };
  assert.deepEqual(Object.keys(coverage).sort(), ['fixtureAppServer', 'fixtureEnv', 'fixtureNode', 'writeFixtureExecutable']);
  const env = coverage.fixtureEnv(f.env);
  assert.notEqual(env, f.env);
  assert.deepEqual(env, { ...f.env, NODE_V8_COVERAGE: '' });
  assert.deepEqual(f.env, before);
  const defaults = coverage.fixtureEnv();
  assert.notEqual(defaults, process.env);
  assert.deepEqual(defaults, { ...process.env, NODE_V8_COVERAGE: '' });
  const stdout = Buffer.from([0, 10, 32, 39, 36, 255]), stderr = Buffer.from('fixture-err\0 空格');
  const code = `process.stdout.write(Buffer.from(${JSON.stringify([...stdout])}));process.stderr.write(Buffer.from(${JSON.stringify([...stderr])}));process.exit(0);`;
  exactOutput(run(f, ['-e', code], { env }), stdout, stderr);
  assert.deepEqual(profiles(f), []);
});

test('fixtureNode isolates before startup and leaves explicit exits byte-for-byte clean', t => {
  const f = fixture(t);
  for (const status of [0, 7]) {
    const args = ['-e', `process.stdout.write('fixture-out');process.stderr.write('fixture-err');process.exit(${status});`];
    const target = coverage.fixtureNode(args);
    assert.deepEqual(target, { command: '/usr/bin/env', args: ['NODE_V8_COVERAGE=', process.execPath, ...args] });
    exactOutput(run(f, target.args, { command: target.command, status }), 'fixture-out', 'fixture-err');
  }
  assert.deepEqual(profiles(f), []);
});

test('fixtureNode keeps pure CJS children and grandchildren out of coverage', t => {
  const f = fixture(t);
  const leaf = 'console.log(JSON.stringify({ coverage: process.env.NODE_V8_COVERAGE }));';
  const withChild = childCode => `
    const nested = require('node:child_process').spawnSync(process.execPath, ['-e', ${JSON.stringify(childCode)}], { encoding: 'utf8', timeout: 5000 });
    if (nested.error) throw nested.error;
    if (nested.status !== 0 || nested.stderr !== '') throw new Error(nested.stderr || 'child failed');
    console.log(JSON.stringify({ coverage: process.env.NODE_V8_COVERAGE, child: JSON.parse(nested.stdout) }));
  `;
  const expected = { coverage: '', child: { coverage: '', child: { coverage: '' } } };
  exactOutput(nodeFixture(f, ['-e', withChild(withChild(leaf))]), JSON.stringify(expected) + '\n');
  assert.deepEqual(profiles(f), []);
});

test('fixtureAppServer preserves normal fake protocol and crash output without profiles', t => {
  const f = fixture(t), target = coverage.fixtureAppServer([fakeServer]);
  assert.deepEqual(target, { binary: '/usr/bin/env', args: ['NODE_V8_COVERAGE=', process.execPath, fakeServer] });
  exactOutput(run(f, target.args, { command: target.binary, input: JSON.stringify({ id: 1, method: 'initialize' }) + '\n' }), '{"id":1,"result":{"userAgent":"fake-test-server"}}\n');
  const crash = coverage.fixtureAppServer([fakeServer, 'crash']);
  exactOutput(run(f, crash.args, { command: crash.binary, status: 7, input: JSON.stringify({ id: 1, method: 'turn/start' }) + '\n' }));
  assert.deepEqual(profiles(f), []);
});

test('AppServerClient retains real outer guard coverage while its fake server is isolated', t => {
  const f = fixture(t);
  const code = `
    import { AppServerClient } from ${JSON.stringify(appServerUrl)};
    import { fixtureAppServer } from ${JSON.stringify(helperUrl)};
    const client = new AppServerClient({ ...fixtureAppServer([${JSON.stringify(fakeServer)}]), requestTimeoutMs: 3000 });
    try {
      const response = await client.initialize();
      client.child.stdin.end();
      await client.closed;
      if (client.stderr !== '') throw new Error(client.stderr);
      console.log(JSON.stringify({ response, pid: client.child.pid, exitCode: client.child.exitCode, coverage: process.env.NODE_V8_COVERAGE }));
    } finally { await client.stop(); }
  `;
  // Node 24.0 reports experimental SQLite while loading the real client; keep
  // that unrelated warning out of this byte-exact fixture assertion only.
  const output = run(f, ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', code]);
  const result = JSON.parse(output.stdout);
  exactOutput(output, JSON.stringify({ response: { userAgent: 'fake-test-server' }, pid: result.pid, exitCode: 0, coverage: f.directory }) + '\n');
  const records = profiles(f).map(name => ({ name, ...JSON.parse(readFileSync(join(f.directory, name), 'utf8')) }));
  const guard = records.find(record => record.name.startsWith(`coverage-${result.pid}-`));
  assert.ok(guard, 'real guard must retain its own profile');
  assert.ok(guard.result.some(script => script.url === guardUrl && script.functions.some(fn => fn.ranges.some(range => range.count > 0))));
  assert.ok(records.some(record => record.result.some(script => script.url === appServerUrl)), 'real AppServerClient execution must remain covered');
  assert.equal(records.some(record => record.result.some(script => script.url === fakeServerUrl)), false);
});

test('generated executable strips a shebang, quotes its path and forwards argv unchanged', t => {
  const f = fixture(t), directory = join(f.root, "launcher's directory with spaces");
  mkdirSync(directory);
  const binary = join(directory, 'fake executable');
  writeFileSync(binary, 'old executable', { mode: 0o600 });
  const source = '#!/usr/bin/env node\r\nconsole.log(JSON.stringify({ args: process.argv.slice(2), coverage: process.env.NODE_V8_COVERAGE ?? null }));process.stderr.write("wrapper-err");';
  coverage.writeFixtureExecutable(binary, source);
  assert.equal(readFileSync(binary + '.mjs', 'utf8'), source.slice(source.indexOf('\n') + 1));
  assert.equal(statSync(binary).mode & 0o777, 0o755);
  const args = ['space arg', "single'quote", '$HOME $(touch injected)', '; exit 9 #'];
  exactOutput(run(f, args, { command: binary, cwd: f.root }), JSON.stringify({ args, coverage: null }) + '\n', 'wrapper-err');
  assert.deepEqual(profiles(f), []);
});

test('generated executable quotes an absolute Node path containing spaces and a single quote', t => {
  const f = fixture(t), directory = join(f.root, "Node runtime's directory");
  mkdirSync(directory);
  const runtime = join(directory, 'node'), binary = join(f.root, 'quoted-node-fixture');
  symlinkSync(process.execPath, runtime);
  const source = "process.stdout.write('quoted-out');process.stderr.write('quoted-err');";
  const build = `
    import { writeFixtureExecutable } from ${JSON.stringify(helperUrl)};
    Object.defineProperty(process, 'execPath', { value: ${JSON.stringify(runtime)} });
    writeFixtureExecutable(${JSON.stringify(binary)}, ${JSON.stringify(source)});
  `;
  exactOutput(run(f, ['--input-type=module', '-e', build], { env: coverage.fixtureEnv(f.env) }));
  exactOutput(run(f, [], { command: binary }), 'quoted-out', 'quoted-err');
  assert.deepEqual(profiles(f), []);
});

test('generated executable clears coverage before Node starts and descendants inherit isolation', t => {
  const f = fixture(t), binary = join(f.root, 'descendant-fixture');
  const leaf = 'console.log(JSON.stringify({ coverage: process.env.NODE_V8_COVERAGE ?? null }));';
  const child = `
    const result = require('node:child_process').spawnSync(process.execPath, ['-e', ${JSON.stringify(leaf)}], { encoding: 'utf8', timeout: 5000 });
    if (result.error) throw result.error;
    if (result.status !== 0 || result.stderr !== '') throw new Error(result.stderr || 'grandchild failed');
    console.log(JSON.stringify({ coverage: process.env.NODE_V8_COVERAGE ?? null, child: JSON.parse(result.stdout) }));
  `;
  coverage.writeFixtureExecutable(binary, `
    import { spawnSync } from 'node:child_process';
    const result = spawnSync(process.execPath, ['-e', ${JSON.stringify(child)}], { encoding: 'utf8', timeout: 5000 });
    if (result.error) throw result.error;
    if (result.status !== 0 || result.stderr !== '') throw new Error(result.stderr || 'child failed');
    console.log(JSON.stringify({ coverage: process.env.NODE_V8_COVERAGE ?? null, child: JSON.parse(result.stdout) }));
  `);
  const expected = { coverage: null, child: { coverage: null, child: { coverage: null } } };
  exactOutput(run(f, [], { command: binary }), JSON.stringify(expected) + '\n');
  assert.deepEqual(profiles(f), []);
});
