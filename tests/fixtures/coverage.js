import { chmodSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const shellQuote = value => `'${value.replaceAll("'", "'\\''")}'`;

// Opt out before pure fixture Nodes start; never change the caller's coverage.
export function fixtureEnv(env = process.env) {
  return { ...env, NODE_V8_COVERAGE: '' };
}

export function fixtureNode(args) {
  return { command: '/usr/bin/env', args: ['NODE_V8_COVERAGE=', process.execPath, ...args] };
}

export function fixtureAppServer(args) {
  const target = fixtureNode(args);
  return { binary: target.command, args: target.args };
}

/** Keep generated JavaScript in ESM; the shell removes coverage before Node starts. */
export function writeFixtureExecutable(path, source) {
  const modulePath = `${path}.mjs`;
  writeFileSync(modulePath, source.replace(/^#![^\n]*(?:\n|$)/, ''));
  writeFileSync(path, `#!/bin/sh\nunset NODE_V8_COVERAGE\nexec ${shellQuote(process.execPath)} ${shellQuote(resolve(modulePath))} "$@"\n`, { mode: 0o755 });
  chmodSync(path, 0o755);
}
