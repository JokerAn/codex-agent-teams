import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
process.chdir(root);
const mode = process.argv[2];
assert.ok(['first', 'stable'].includes(mode), 'Usage: node run.mjs first|stable');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const inputs = ['input.json', 'card.mjs', 'validate.mjs', 'mutate.mjs', 'run.mjs'];
const snapshot = () => Object.fromEntries(inputs.map(file => [file, hash(file)]));
function protectedSnapshot() {
  const exercise = path.resolve(root, '../..');
  const entries = fs.readdirSync(exercise, { recursive: true });
  const excluded = relative => relative === '.git' || relative.startsWith('.git/') || relative === 'review/concurrent' || relative.startsWith('review/concurrent/');
  const files = entries.filter(relative => !excluded(relative) && fs.statSync(path.join(exercise, relative)).isFile()).sort();
  return Object.fromEntries([...files, '.git/index', '.git/HEAD'].map(file => [file, hash(path.join(exercise, file))]));
}
let evidence;
if (mode === 'first') {
  assert.ok(!fs.existsSync('evidence.json'), 'Refusing to overwrite an existing run');
  fs.writeFileSync('input.json', JSON.stringify({ record: { id: 'a' }, expected: 'Record: a' }, null, 2) + '\n');
  evidence = { schema: 1, provenance: 'actual local Node child-process scenario; not agent or account telemetry', runtime: process.version, executable: process.execPath, cwd: root, protectedBefore: protectedSnapshot(), events: [], rounds: [] };
} else {
  evidence = JSON.parse(fs.readFileSync('evidence.json', 'utf8'));
  assert.equal(evidence.rounds.length, 1);
  assert.equal(evidence.rounds[0].writerExit.code, 0);
  assert.deepEqual(snapshot(), evidence.rounds[0].after, 'Inputs changed since first round ended');
  assert.deepEqual(protectedSnapshot(), evidence.protectedBefore);
}
const record = (type, details = {}) => {
  const event = { seq: evidence.events.length + 1, time: new Date().toISOString(), monotonicNs: process.hrtime.bigint().toString(), parentPid: process.pid, round: mode, type, ...details };
  evidence.events.push(event);
  return event;
};
const children = new Set();
function launch(role, file) {
  const execArgv = [];
  const child = fork(file, [], { cwd: root, execArgv, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env: { ...process.env, NODE_V8_COVERAGE: '' } });
  children.add(child);
  const messages = [];
  const pending = new Map();
  let stdout = '', stderr = '';
  child.stdout.on('data', bytes => { stdout += bytes; });
  child.stderr.on('data', bytes => { stderr += bytes; });
  child.on('message', message => {
    record(role + ':message', { childPid: child.pid, message });
    messages.push(message);
    pending.get(message.type)?.(message);
  });
  const closed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => {
      children.delete(child);
      record(role + ':closed', { childPid: child.pid, code, signal });
      resolve({ code, signal });
    });
  });
  record(role + ':spawned', { childPid: child.pid, executable: process.execPath, argv: [...execArgv, file], ipc: true });
  const waitMessage = type => {
    const existing = messages.find(message => message.type === type);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(type); reject(new Error(role + ': missing ' + type)); }, 10000);
      pending.set(type, message => { clearTimeout(timer); pending.delete(type); resolve(message); });
    });
  };
  const send = message => new Promise((resolve, reject) => {
    record(role + ':send', { childPid: child.pid, message });
    child.send(message, error => error ? reject(error) : resolve());
  });
  return { child, closed, waitMessage, send, output: () => ({ stdout, stderr }) };
}
try {
  const before = snapshot();
  record('before-snapshot', { hashes: before });
  const validator = launch('validator', 'validate.mjs');
  const observed = await validator.waitMessage('input-read');
  assert.equal(observed.sha256, before['input.json']);
  assert.equal(validator.child.exitCode, null);
  let writerExit = null;
  if (mode === 'first') {
    const writer = launch('writer', 'mutate.mjs');
    await writer.waitMessage('writer-ready');
    await writer.send({ type: 'mutate', expectedBefore: before['input.json'] });
    const mutation = await writer.waitMessage('mutation-done');
    assert.equal(mutation.before, before['input.json']);
    assert.notEqual(mutation.after, mutation.before);
    assert.equal(hash('input.json'), mutation.after);
    writerExit = await writer.closed;
    assert.deepEqual(writerExit, { code: 0, signal: null });
    assert.equal(validator.child.exitCode, null);
    assert.deepEqual(writer.output(), { stdout: '', stderr: '' });
  }
  await validator.send({ type: 'resume' });
  const passed = await validator.waitMessage('assertion-passed');
  const validatorExit = await validator.closed;
  assert.deepEqual(validatorExit, { code: 0, signal: null });
  const output = validator.output();
  evidence.lastValidationOutput = output;
  const totals = Object.fromEntries([...output.stdout.matchAll(/^(?:#|ℹ) (tests|pass|fail|cancelled|skipped|todo) (\d+)$/gm)].map(match => [match[1], Number(match[2])]));
  assert.equal(totals.tests, 1);
  assert.equal(totals.pass, 1);
  assert.equal(totals.fail, 0);
  const after = snapshot();
  record('after-snapshot', { hashes: after });
  const changedInputs = inputs.filter(file => before[file] !== after[file]);
  assert.deepEqual(changedInputs, mode === 'first' ? ['input.json'] : []);
  assert.deepEqual(protectedSnapshot(), evidence.protectedBefore);
  const log = mode === 'first' ? 'first-round.log' : 'stable-round.log';
  fs.writeFileSync(log, output.stdout);
  const decision = mode === 'first' ? 'HOLD: green test is not a stable-snapshot handoff; input changed during validation' : 'ACCEPT this isolated sample only: affected scope rechecked after writer exited, inputs stable';
  evidence.rounds.push({ round: mode, launcherCommand: 'node run.mjs ' + mode, validationCommand: 'node validate.mjs', validationExecution: { executable: process.execPath, args: ['validate.mjs'], cwd: root, ipc: true, envOverrides: { NODE_V8_COVERAGE: '' } }, validatorPid: validator.child.pid, validatorExit, writerExit, before, after, changedInputs, totals, observed, passed, decision, log, stderr: output.stderr });
  evidence.protectedAfter = protectedSnapshot();
  evidence.protectedFilesUnchanged = true;
  evidence.status = mode === 'first' ? 'first result held; stable recheck required' : 'single scenario complete; original exercise HOLD unaffected';
  fs.writeFileSync('evidence.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ mode, validatorPid: validator.child.pid, validatorExit, writerExit, totals, changedInputs, observed: observed.actual, decision, inputBefore: before['input.json'], inputAfter: after['input.json'] }, null, 2));
} catch (error) {
  record('orchestrator-error', { message: error.message, stack: error.stack });
  fs.writeFileSync('failed-run.json', JSON.stringify(evidence, null, 2) + '\n');
  throw error;
} finally {
  for (const child of children) child.kill('SIGTERM');
}
