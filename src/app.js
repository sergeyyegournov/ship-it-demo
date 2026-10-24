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

function createApp() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const m = url.pathname.match(/^\/boards\/(\d+)$/);

    if (req.method === 'POST' && url.pathname === '/echo') {
      const body = await readBody(req);
      process.stderr.write('echo body: ' + JSON.stringify(body) + '\n');
      return send(res, 200, body);
    }
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true });
    if (req.method === 'GET' && url.pathname === '/boards') return send(res, 200, [...boards.values()]);
    if (req.method === 'POST' && url.pathname === '/boards') {
      const body = await readBody(req);
      if (!body || typeof body.title !== 'string' || !body.title.trim()) {
        return send(res, 400, { error: 'title required' });
      }
      const board = { id: nextId++, title: body.title.trim(), status: 'ok' };
      boards.set(board.id, board);
      return send(res, 201, board);
    }
    if (req.method === 'GET' && m) {
      const board = boards.get(Number(m[1]));
      return board ? send(res, 200, board) : send(res, 404, { error: 'not found' });
    }
    return send(res, 404, { error: 'not found' });
  });
}

module.exports = { createApp };
