import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRecord } from '../src/store.mjs';
test('found record', async () => assert.deepEqual(await loadRecord('a'), {kind:'found',record:{id:'a'}}));
