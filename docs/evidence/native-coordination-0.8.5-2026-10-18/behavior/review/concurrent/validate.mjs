import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderCard } from './card.mjs';

if (!process.send) throw new Error('Run via run.mjs: IPC handshake is required');
const send = data => new Promise((resolve, reject) => {
  process.send({ ...data, pid: process.pid }, error => error ? reject(error) : resolve());
});
let resume;
const resumed = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('resume handshake timed out')), 10000);
  resume = message => {
    if (message.type !== 'resume') return;
    clearTimeout(timer);
    process.off('message', resume);
    resolve();
  };
  process.on('message', resume);
});

await test('renderCard matches the input read by this run', async () => {
  const bytes = fs.readFileSync('input.json');
  const input = JSON.parse(bytes);
  const actual = renderCard(input.record);
  await send({ type: 'input-read', sha256: crypto.createHash('sha256').update(bytes).digest('hex'), actual, expected: input.expected });
  await resumed;
  assert.equal(actual, input.expected);
  await send({ type: 'assertion-passed', actual, expected: input.expected });
});
process.disconnect();
