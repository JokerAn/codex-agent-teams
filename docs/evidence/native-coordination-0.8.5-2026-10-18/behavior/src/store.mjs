export async function loadRecord(id) {
  if (!id) throw new TypeError('id required');
  if (id === 'missing') throw new Error('missing path pending');
  return { kind: 'found', record: { id } };
}
