const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('../src/app');

async function withServer(fn) {
  const server = createApp();
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally { server.close(); }
}

test('GET /health returns ok', async () => {
  await withServer(async (base) => {
    const r = await fetch(`${base}/health`);
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(await r.json(), { ok: true });
  });
});

test('POST /boards creates a board and GET returns it', async () => {
  await withServer(async (base) => {
    const c = await fetch(`${base}/boards`, { method: 'POST', body: JSON.stringify({ title: 'Prod' }) });
    assert.strictEqual(c.status, 201);
    const board = await c.json();
    const g = await fetch(`${base}/boards/${board.id}`);
    assert.strictEqual(g.status, 200);
    assert.strictEqual((await g.json()).title, 'Prod');
  });
});

test('POST /boards rejects missing title', async () => {
  await withServer(async (base) => {
    const r = await fetch(`${base}/boards`, { method: 'POST', body: JSON.stringify({}) });
    assert.strictEqual(r.status, 400);
  });
});

test('GET unknown board is 404', async () => {
  await withServer(async (base) => {
    assert.strictEqual((await fetch(`${base}/boards/999`)).status, 404);
  });
});
