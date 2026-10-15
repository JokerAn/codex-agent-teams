import { execFileSync } from 'node:child_process';

export function groupMembers(pid) {
  return execFileSync('/bin/ps', ['-axo', 'pid=,pgid='], { encoding: 'utf8', timeout: 1000, maxBuffer: 4 * 1024 * 1024, stdio: 'pipe', detached: true })
    .trim().split('\n').map(row => row.trim().split(/\s+/).map(Number))
    .filter(([, group]) => group === pid).map(([member]) => member);
}

// macOS may deny group signals; only signal individual verified group members.
export function signalGroup(pid, signal) {
  try { process.kill(-pid, signal); }
  catch (error) {
    if (error.code === 'ESRCH') return;
    if (process.platform !== 'darwin' || error.code !== 'EPERM') throw error;
    for (const member of groupMembers(pid).sort((a, b) => (a === pid) - (b === pid))) {
      try {
        const group = execFileSync('/bin/ps', ['-p', String(member), '-o', 'pgid='], { encoding: 'utf8', timeout: 1000, stdio: 'pipe', detached: true });
        if (Number(group.trim()) === pid) process.kill(member, signal);
      } catch (failure) { if (failure.code !== 'ESRCH' && failure.status !== 1) throw failure; }
    }
  }
}
