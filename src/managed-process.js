import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The guard is the process-group leader. Its private fd 3 is never inherited by
// the command: EOF means the owning runtime died, including an uncatchable KILL.
export function spawnManaged(command, args, options) {
  const child = spawn(process.execPath, [fileURLToPath(new URL('./process-guard.js', import.meta.url)), command, ...args], {
    ...options, detached: true, shell: false, stdio: [...options.stdio, 'pipe'],
  });
  let buffer = '';
  child.stdio[3].setEncoding('utf8');
  child.stdio[3].on('error', () => {});
  child.stdio[3].on('data', chunk => {
    buffer += chunk;
    if (buffer.length > 4096) { child.stdio[3].destroy(); return; }
    const end = buffer.indexOf('\n');
    if (end < 0) return;
    try {
      child.guardReport = JSON.parse(buffer.slice(0, end));
      if (child.guardReport.spawnError) {
        const error = Object.assign(new Error(child.guardReport.spawnError.message), { code: child.guardReport.spawnError.code });
        child.emit('error', error);
      }
    } catch { child.stdio[3].destroy(); }
    buffer = buffer.slice(end + 1);
  });
  return child;
}
