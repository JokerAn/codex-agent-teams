import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { overview, renderHtml } from './status.js';

/** An MCP-owned, loopback-only viewer. Reads snapshots on demand; never owns or schedules tasks. */
export async function startStatusPanel(observe, { taskIds, limit = 20 } = {}) {
  // Validate selection before opening a listener; observing cannot acquire owner.
  overview(observe(), { taskIds, limit, projection: 'summary' });
  const path = `/status/${randomBytes(24).toString('hex')}`;
  let origin;
  const server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    if (request.headers.host !== origin?.slice(7) || (request.headers.origin && request.headers.origin !== origin)) {
      response.writeHead(403).end(); return;
    }
    const url = new URL(request.url, origin);
    if (url.pathname !== path) { response.writeHead(404).end(); return; }
    if (request.method !== 'GET') { response.writeHead(405, { Allow: 'GET' }).end(); return; }
    try {
      const params = url.searchParams;
      if ([...params.keys()].some(key => !['view', 'q', 'status', 'history', 'limit'].includes(key))
        || (params.has('view') && !['all', 'selected'].includes(params.get('view')))
        || (params.get('view') === 'selected' && taskIds === undefined)
        || (params.has('history') && !['0', '1'].includes(params.get('history')))) {
        response.writeHead(400).end('Invalid panel filter'); return;
      }
      const selected = taskIds !== undefined && params.get('view') !== 'all';
      const options = { taskIds: selected ? taskIds : undefined, limit: params.has('limit') ? Number(params.get('limit')) : limit,
        query: params.get('q') ?? '', status: params.get('status') ?? 'all', showHistory: params.has('history') ? params.get('history') === '1' : selected };
      let report;
      try { report = overview(observe(), options); }
      catch (error) { if (/Status limit|Invalid status filter/.test(error.message)) { response.writeHead(400).end('Invalid panel filter'); return; } throw error; }
      const html = renderHtml({ ...report, panelSelection: taskIds ?? null }, { live: true });
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html);
    } catch {
      response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }).end('状态读取失败，请稍后重试；上次显示不代表当前进度。');
    }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  let closing;
  return { url: origin + path, refreshMs: 2000, close: () => closing ??= new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  }) };
}
