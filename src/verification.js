import { createHash } from 'node:crypto';
import { spawnManaged } from './managed-process.js';
import { signalGroup } from './process-group.js';
export { signalGroup } from './process-group.js';
import { closeSync, lstatSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { processAlive } from './store.js';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export function verifyLogEvidence(check, directory) {
  z.uuid().parse(check.id);
  if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink() || lstatSync(join(directory, '..')).isSymbolicLink()) throw new Error('Verification log directory was replaced');
  let total = 0;
  for (const name of ['stdout', 'stderr']) {
    const path = join(directory, `${name}.log`);
    const stat = lstatSync(path); total += stat.size;
    if (check[`${name}Path`] !== path || !stat.isFile() || stat.isSymbolicLink() || total > check.maxOutputBytes || digest(readFileSync(path)) !== check[`${name}Digest`]) throw new Error('Verification log evidence is missing or changed');
  }
}

const argument = z.string().max(8000).refine(value => !value.includes('\0'), 'NUL is not a command argument');
export const verificationSchema = z.strictObject({
  command: argument.refine(value => value.trim().length > 0, 'Provide an executable'),
  args: z.array(argument).max(100).default([]),
  timeoutMs: z.number().int().min(100).max(3600000).default(600000),
  maxOutputBytes: z.number().int().min(1024).max(16 * 1024 * 1024).default(2 * 1024 * 1024),
});

/** One explicit command, raw bounded logs, managed Unix process group. No implicit shell. */
export async function runVerification(spec, { cwd, logDir, signal, onSpawn = () => {}, onLaunch = () => {} }) {
  if (!['darwin', 'linux'].includes(process.platform)) throw new Error('Command verification supports macOS/Linux only');
  spec = verificationSchema.parse(spec);
  const startedAt = new Date().toISOString();
  mkdirSync(logDir, { recursive: false, mode: 0o700 });
  if (!lstatSync(logDir).isDirectory() || lstatSync(logDir).isSymbolicLink()) throw new Error('Verification log directory was replaced');
  const paths = { stdoutPath: join(logDir, 'stdout.log'), stderrPath: join(logDir, 'stderr.log') };
  const logs = [];
  try {
    for (const path of Object.values(paths)) logs.push(openSync(path, 'wx', 0o600));
    const base = { ...spec, ...paths, startedAt };
    if (signal?.aborted) return { ...base, status: 'cancelled', exitCode: null, signal: null, error: String(signal.reason?.message ?? 'Cancelled'), stdoutBytes: 0, stderrBytes: 0, stdoutDigest: digest(''), stderrDigest: digest(''), outputTruncated: false, cleanupConfirmed: true, endedAt: new Date().toISOString() };
    return await new Promise(resolve => {
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_') && !['NODE_OPTIONS', 'NODE_PATH', 'PWD', 'INIT_CWD'].includes(key)));
      // Record that a launch was ATTEMPTED before spawning: a crash between these two points would
      // otherwise leave a record that looks identical to "never started", and recovery could not tell a
      // possibly-live process group from an absent one.
      onLaunch();
      const child = spawnManaged(spec.command, spec.args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...env, PWD: cwd, INIT_CWD: cwd } });
      let closed = false, done = false, exitCode = null, exitSignal = null, reason, failure, cleanupError, outputTruncated = false;
      const counts = [0, 0], hashes = [createHash('sha256'), createHash('sha256')];
      let written = 0, deadline, force, drain, poll;
      const alive = () => processAlive(child.pid, true);
      const finish = () => {
        if (done) return;
        done = true;
        for (const timer of [deadline, force, drain]) clearTimeout(timer);
        clearInterval(poll); signal?.removeEventListener('abort', abort);
        const cleanupConfirmed = closed && !alive();
        if (!closed) { child.stdout.destroy(); child.stderr.destroy(); child.unref(); }
        resolve({ ...base, ...(child.pid ? { childPid: child.pid } : {}), status: reason ?? (exitCode === 0 && !failure && cleanupConfirmed ? 'passed' : 'failed'),
          exitCode, signal: exitSignal, ...(failure ? { error: failure } : {}), ...(cleanupError ? { cleanupError } : {}),
          stdoutBytes: counts[0], stderrBytes: counts[1], stdoutDigest: hashes[0].digest('hex'), stderrDigest: hashes[1].digest('hex'), outputTruncated, cleanupConfirmed, endedAt: new Date().toISOString() });
      };
      const check = () => { if (closed && !alive()) finish(); };
      const send = name => { try { signalGroup(child.pid, name); } catch (error) { cleanupError = error.message; } };
      const stop = (status, message) => {
        if (done || reason) return;
        reason = status; failure = message;
        if (child.pid && alive()) send('SIGTERM');
        force = setTimeout(() => { if (alive()) send('SIGKILL'); }, 300);
        drain = setTimeout(finish, 2300);
        poll = setInterval(check, 25);
        check();
      };
      const abort = () => stop('cancelled', String(signal.reason?.message ?? 'Cancelled'));
      child.on('error', error => { failure = error.message; });
      child.on('exit', (code, terminatedBy) => {
        exitCode = child.guardReport?.spawnError ? null : code; exitSignal = terminatedBy;
        if (child.guardReport?.descendants && !reason) stop('failed', 'Command exited while descendants were still running');
        if (!reason && alive()) stop('failed', 'Command exited while descendants were still running');
      });
      child.on('close', () => {
        closed = true;
        if (child.guardReport?.spawnError) exitCode = null;
        if (child.guardReport?.descendants && !reason) stop('failed', 'Command exited while descendants were still running');
        if (alive()) stop('failed', 'Command left descendants running');
        check();
      });
      [child.stdout, child.stderr].forEach((stream, index) => {
        stream.on('error', error => stop('failed', `Output stream failed: ${error.message}`));
        stream.on('data', chunk => {
          if (done) return;
          counts[index] += chunk.length;
          const available = Math.max(0, spec.maxOutputBytes - written);
          const kept = chunk.subarray(0, available);
          try { if (kept.length) { writeFileSync(logs[index], kept); hashes[index].update(kept); written += kept.length; } }
          catch (error) { stop('failed', `Log write failed: ${error.message}`); }
          if (chunk.length > available) { outputTruncated = true; stop('output_limit', 'Combined stdout/stderr exceeded maxOutputBytes'); }
        });
      });
      signal?.addEventListener('abort', abort, { once: true });
      deadline = setTimeout(() => stop('timed_out', 'Verification deadline exceeded'), spec.timeoutMs);
      try { if (child.pid) onSpawn({ childPid: child.pid, ...paths }); }
      catch (error) { stop('failed', `Cannot persist child identity: ${error.message}`); }
      if (signal?.aborted) abort();
    });
  } finally { for (const fd of logs) closeSync(fd); }
}
