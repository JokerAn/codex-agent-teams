import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

if (!process.send) throw new Error('Run via run.mjs: IPC authorization is required');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const timer = setTimeout(() => { throw new Error('mutation authorization timed out'); }, 10000);
process.once('message', message => {
  clearTimeout(timer);
  assert.equal(message.type, 'mutate');
  const before = digest(fs.readFileSync('input.json'));
  assert.equal(before, message.expectedBefore);
  fs.writeFileSync('input.json', JSON.stringify({ record: { id: 'b' }, expected: 'Record: b' }, null, 2) + '\n');
  const after = digest(fs.readFileSync('input.json'));
  process.send({ type: 'mutation-done', pid: process.pid, before, after }, error => {
    if (error) throw error;
    process.disconnect();
  });
});
process.send({ type: 'writer-ready', pid: process.pid });
