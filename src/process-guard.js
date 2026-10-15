import { spawn } from 'node:child_process';
import { Socket } from 'node:net';
import { groupMembers, signalGroup } from './process-group.js';

const life = new Socket({ fd: 3, readable: true, writable: true });
const [command, ...args] = process.argv.slice(2);
let stopping = false, finishing = false, outcome, timer, poll;
const report = value => { if (!life.destroyed) life.write(JSON.stringify(value) + '\n'); };
const others = () => groupMembers(process.pid).filter(pid => pid !== process.pid);
const finish = () => {
  if (finishing) return;
  finishing = true;
  clearTimeout(timer); clearInterval(poll);
  const { code, signal } = outcome ?? { code: 1 };
  // Flush the small private receipt before exit, preserving the command status.
  life.end(() => {
    if (signal) {
      process.removeAllListeners(signal);
      process.kill(process.pid, signal);
    } else process.exit(code ?? 1);
  });
  if (life.destroyed) process.exit(code ?? 1);
};
const stop = () => {
  if (stopping || finishing) return;
  stopping = true;
  // Install handlers before the group signal; this guard must survive TERM to
  // deliver KILL even when both the runtime and the command have stopped.
  try { signalGroup(process.pid, 'SIGTERM'); } catch { /* KILL remains mandatory. */ }
  timer = setTimeout(() => { signalGroup(process.pid, 'SIGKILL'); }, 300);
  poll = setInterval(() => {
    try { if (outcome && others().length === 0) finish(); }
    catch { /* Cannot confirm exit: retain the bounded KILL fallback. */ }
  }, 25);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
life.on('end', stop);
life.on('error', stop);
life.resume();

const child = spawn(command, args, { stdio: ['inherit', 'inherit', 'inherit'], shell: false, detached: false });
child.on('error', error => {
  report({ spawnError: { code: error.code, message: error.message.slice(0, 2000) } });
  outcome = { code: 127 };
  finish();
});
child.on('exit', (code, signal) => {
  outcome = { code, signal };
  try {
    if (others().length) { report({ descendants: true }); stop(); }
    else finish();
  } catch { stop(); }
});
