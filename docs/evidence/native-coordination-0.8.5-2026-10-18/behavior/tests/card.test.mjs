import test from 'node:test';
import assert from 'node:assert/strict';
import { card } from '../src/card.mjs';
test('card uses missing result', async () => assert.equal(await card('missing', async () => ({kind:'missing'})), 'No record'));
