import { loadRecord } from './store.mjs';
export async function list(ids, load = loadRecord) {
  const result = await Promise.all(ids.map(id => load(id)));
  return result.flatMap(item => item.kind === 'missing' ? [] : [item.record.id]);
}
