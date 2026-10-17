import test from 'node:test';
import assert from 'node:assert/strict';
import { list } from '../src/list.mjs';
test('list drops missing', async () => assert.deepEqual(await list(['a','missing'], async id => id === 'missing' ? {kind:'missing'} : {kind:'found',record:{id}}), ['a']));
