import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { TaskStore } from '../src/store.js';
import { readSnapshot, renderHtml, overview } from '../src/status.js';
import { startStatusPanel } from '../src/status-panel.js';

test('live panel reads changing state alongside owner without writing, and shutdown closes the listener', async t => {
  const root = mkdtempSync(join(tmpdir(), 'teams-panel-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const panel = await startStatusPanel(() => readSnapshot(root));
  t.after(() => panel.close());
  let response = await fetch(panel.url);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(await response.text(), /实时读取/);
  assert.equal(existsSync(join(root, '.codex-teams')), false);
  const store = new TaskStore(join(root, '.codex-teams/state.sqlite'));
  t.after(() => store.close());
  const task = { id: 'task', objective: '<script>bad()</script>', status: 'running', dependencies: [], updatedAt: new Date().toISOString(),
    attempts: [{ id: 'attempt', status: 'running', phase: 'member', startedAt: new Date().toISOString(), selection: { model: 'model', effort: 'high' } }] };
  store.save(task, 'fixture');
  const before = store.db.prepare('SELECT COUNT(*) AS count FROM events').get().count;
  const owner = store.db.prepare('SELECT value FROM meta WHERE key=?').get('owner').value;
  const active = await (await fetch(panel.url)).text();
  assert.match(active, /成员执行/); assert.match(active, /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(active, /<script>bad\(\)<\/script>/);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM events').get().count, before);
  assert.equal(store.db.prepare('SELECT value FROM meta WHERE key=?').get('owner').value, owner);
  task.status = 'awaiting_review'; task.attempts[0].status = 'awaiting_review'; task.attempts[0].endedAt = new Date().toISOString();
  store.save(task, 'fixture');
  assert.match(await (await fetch(panel.url)).text(), /等待队长复核/);
  await Promise.all([panel.close(), panel.close()]);
  await assert.rejects(fetch(panel.url));
});

test('viewer rejects unrecognized routes, methods and origins and reports read failures without leaking details', async t => {
  let broken = false;
  const panel = await startStatusPanel(() => {
    if (broken) throw Error('private fixture detail');
    return { tasks: [], workspaces: [], owner: null, stateExists: false };
  });
  t.after(() => panel.close());
  const url = new URL(panel.url);
  assert.equal((await fetch(new URL('/', url))).status, 404);
  assert.equal((await fetch(panel.url, { method: 'POST' })).status, 405);
  assert.equal((await fetch(panel.url, { headers: { Origin: 'http://other.test' } })).status, 403);
  const badHost = await new Promise((resolve, reject) => {
    const req = request(panel.url, { headers: { Host: 'other.test' } }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
    req.on('error', reject); req.end();
  });
  assert.equal(badHost, 403);
  broken = true;
  const failed = await fetch(panel.url);
  assert.equal(failed.status, 503);
  const message = await failed.text();
  assert.match(message, /上次显示不代表当前进度/); assert.doesNotMatch(message, /private fixture detail/);
});

test('static exports remain offline while live pages poll and label stale observations', () => {
  const report = overview({ tasks: [], workspaces: [], owner: null, stateExists: false });
  const snapshot = renderHtml(report), live = renderHtml(report, { live: true });
  assert.match(snapshot, /connect-src 'none'/); assert.doesNotMatch(snapshot, /fetch\(/);
  assert.match(live, /connect-src 'self'/); assert.match(live, /AbortSignal.timeout\(5000\)/);
  assert.match(live, /当前显示为上次成功读取的记录/);
  assert.match(live, /expanded.includes\(task.dataset.taskId\)/);
  assert.match(live, /耗时增长不证明成员正在推进/);
});

test('selected live view explains 1 of 13, folds project history and searches all rows before the limit', async t => {
  const tasks = Array.from({ length: 13 }, (_, i) => ({ id: `task-${i}`, objective: i === 0 ? 'oldest-unique-result' : `History ${i}`,
    dependencies: [], status: 'succeeded', updatedAt: new Date(1000 * i).toISOString(), attempts: [] }));
  const snapshot = { tasks, workspaces: [], owner: null, stateExists: true };
  const original = structuredClone(snapshot);
  const panel = await startStatusPanel(() => snapshot, { taskIds: ['task-0'], limit: 2 });
  t.after(() => panel.close());
  let html = await (await fetch(panel.url)).text();
  assert.match(html, /选定 1 条/); assert.match(html, /项目累计 13 条/); assert.match(html, /不代表自动识别宿主会话/);
  assert.equal((html.match(/<article /g) ?? []).length, 1);
  const all = new URL(panel.url); all.searchParams.set('view', 'all');
  html = await (await fetch(all)).text();
  assert.equal((html.match(/<article /g) ?? []).length, 0); assert.match(html, /展开历史终态/);
  all.searchParams.set('history', '1');
  html = await (await fetch(all)).text();
  assert.match(html, /尚有 11 条未展示/); assert.match(html, /显示更多/);
  all.searchParams.set('q', 'oldest-unique-result');
  html = await (await fetch(all)).text();
  assert.equal((html.match(/<article /g) ?? []).length, 1); assert.match(html, /oldest-unique-result/);
  all.searchParams.set('q', 'x'.repeat(201)); assert.equal((await fetch(all)).status, 400);
  all.searchParams.delete('q'); all.searchParams.set('limit', '101'); assert.equal((await fetch(all)).status, 400);
  assert.deepEqual(snapshot, original, 'all filters remain read-only');
  await assert.rejects(startStatusPanel(() => snapshot, { taskIds: ['other-project-id'] }), /does not belong/);
});

test('show more reads refreshed main limit instead of capturing the initial page limit', async () => {
  const report = overview({ tasks: [], workspaces: [], owner: null, stateExists: false }, { limit: 20 });
  const html = renderHtml({ ...report, panelSelection: [] }, { live: true });
  const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
  let current;
  const main = limit => {
    const nodes = Object.fromEntries(['search', 'filter', 'scope', 'history', 'more', 'connection'].map(id => [id, {
      id, value: id === 'filter' ? 'all' : id === 'scope' ? 'all' : '', checked: true,
      addEventListener(name, callback) { this[name] = callback; },
    }]));
    return { dataset: { limit: String(limit) }, nodes, querySelector: selector => nodes[selector.slice(1)], querySelectorAll: () => [], replaceWith: next => { current = next; } };
  };
  current = main(20);
  const context = createContext({ URL, location: new URL('http://localhost/status/test?history=1'),
    document: { getElementById: id => current.nodes[id], querySelector: () => current, querySelectorAll: () => [], activeElement: { id: '' } },
    history: { replaceState: (state, title, url) => { context.location = new URL(url); } },
    setTimeout: () => 1, clearTimeout: () => {}, AbortSignal,
    fetch: async () => ({ ok: true, text: async () => '' }),
    DOMParser: class { parseFromString() { return { querySelector: () => main(Number(context.location.searchParams.get('limit'))) }; } },
  });
  runInContext(script, context);
  for (const expected of [40, 60, 80, 100]) {
    current.nodes.more.click();
    assert.equal(Number(context.location.searchParams.get('limit')), expected);
    await runInContext('refresh()', context);
  }
});
