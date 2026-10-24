const http = require('node:http');

const boards = new Map();
let nextId = 1;

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve(null); }
    });
  });
}

// Bounded body reader for the archive routes. Always settles, and only after the request
// stream finishes, so a rejection is never written while the client is still uploading.
function readSmallBody(req, limit = 1024) {
  return new Promise((resolve) => {
    let settled = false;
    let oversized = Number(req.headers['content-length']) > limit;
    let size = 0;
    let chunks = [];
    const settle = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    req.on('data', (c) => {
      if (oversized) return;
      size += c.length;
      if (size > limit) {
        oversized = true;
        chunks = [];
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (oversized) return settle({ ok: false });
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw === '') return settle({ ok: true, value: {} });
      try {
        const value = JSON.parse(raw);
        const ok = typeof value === 'object' && value !== null && !Array.isArray(value)
          && Object.keys(value).length === 0;
        settle(ok ? { ok: true, value } : { ok: false });
      } catch {
        settle({ ok: false });
      }
    });
    req.on('error', () => settle({ ok: false }));
    req.on('close', () => { if (!req.complete) settle({ ok: false }); });
    req.resume();
  });
}

// Returns 'active', 'archived', or null for an invalid query.
function parseListQuery(params) {
  const keys = [...params.keys()];
  if (keys.length === 0) return 'active';
  if (keys.length > 1 || keys[0] !== 'archived') return null;
  const value = params.get('archived');
  if (value === 'true') return 'archived';
  if (value === 'false') return 'active';
  return null;
}

function createApp() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const m = url.pathname.match(/^\/boards\/(\d+)$/);
    const action = url.pathname.match(/^\/boards\/(\d+)\/(archive|unarchive)$/);

    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true });
    if (req.method === 'GET' && url.pathname === '/boards') {
      const filter = parseListQuery(url.searchParams);
      if (!filter) return send(res, 400, { error: 'invalid query' });
      const archived = filter === 'archived';
      return send(res, 200, [...boards.values()].filter((b) => b.archived === archived));
    }
    if (req.method === 'POST' && url.pathname === '/boards') {
      const body = await readBody(req);
      if (!body || typeof body.title !== 'string' || !body.title.trim()) {
        return send(res, 400, { error: 'title required' });
      }
      const board = { id: nextId++, title: body.title.trim(), status: 'ok', archived: false, archivedAt: null };
      boards.set(board.id, board);
      return send(res, 201, board);
    }
    if (req.method === 'POST' && action) {
      const body = await readSmallBody(req);
      if (!body.ok) return send(res, 400, { error: 'invalid body' });
      const id = Number(action[1]);
      const board = Number.isSafeInteger(id) ? boards.get(id) : undefined;
      if (!board) return send(res, 404, { error: 'not found' });
      if (action[2] === 'archive' && !board.archived) {
        board.archived = true;
        board.archivedAt = new Date().toISOString();
      } else if (action[2] === 'unarchive' && board.archived) {
        board.archived = false;
        board.archivedAt = null;
      }
      return send(res, 200, board);
    }
    if (req.method === 'GET' && m) {
      const board = boards.get(Number(m[1]));
      return board ? send(res, 200, board) : send(res, 404, { error: 'not found' });
    }
    return send(res, 404, { error: 'not found' });
  });
}

module.exports = { createApp };
