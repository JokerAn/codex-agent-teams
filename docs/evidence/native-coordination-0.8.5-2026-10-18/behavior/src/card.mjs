import { loadRecord } from './store.mjs';
export async function card(id, load = loadRecord) {
  const result = await load(id);
  return result.kind === 'missing' ? 'No record' : `Record: ${result.record.id}`;
}
