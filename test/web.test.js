const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { createApp } = require('../src/app');
const view = require('../web/board-view');

async function withServer(opts, fn) {
  const server = createApp(opts);
  await new Promise((r) => server.listen(0, r));
  try { await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); }
}

test('the API answers under /api as well as at the root', async () => {
  await withServer({}, async (base) => {
    assert.strictEqual((await fetch(`${base}/api/health`)).status, 200);
    const c = await fetch(`${base}/api/boards`, { method: 'POST', body: JSON.stringify({ title: 'Via api' }) });
    assert.strictEqual(c.status, 201);
    const list = await (await fetch(`${base}/boards`)).json();
    assert.ok(list.some((b) => b.title === 'Via api'));
  });
});

test('GET /version reports APP_VERSION', async () => {
  process.env.APP_VERSION = 'abc1234';
  try {
    await withServer({}, async (base) => {
      assert.deepStrictEqual(await (await fetch(`${base}/api/version`)).json(), { version: 'abc1234' });
    });
  } finally { delete process.env.APP_VERSION; }
});

test('webDir serves the SPA and refuses path traversal', async () => {
  const webDir = path.resolve(__dirname, '../web');
  await withServer({ webDir }, async (base) => {
    const index = await fetch(`${base}/`);
    assert.strictEqual(index.status, 200);
    assert.match(await index.text(), /Status board/);
    assert.strictEqual((await fetch(`${base}/app.js`)).status, 200);
    const escape = await fetch(`${base}/..%2fpackage.json`);
    assert.strictEqual(escape.status, 404);
  });
  await withServer({}, async (base) => assert.strictEqual((await fetch(`${base}/`)).status, 404));
});

test('view: titles are trimmed and bounded', () => {
  assert.deepStrictEqual(view.validateTitle('  Prod  '), { ok: true, title: 'Prod' });
  assert.strictEqual(view.validateTitle('   ').ok, false);
  assert.strictEqual(view.validateTitle('x'.repeat(81)).ok, false);
});

test('view: sorting and summary', () => {
  const sorted = view.sortBoards([{ id: 2, title: 'b' }, { id: 1, title: 'a' }]);
  assert.deepStrictEqual(sorted.map((b) => b.id), [1, 2]);
  assert.strictEqual(view.summary([{}], []), '1 active board');
  assert.strictEqual(view.summary([{}, {}], [{}]), '2 active boards, 1 archived');
});

test('request logs: one JSON line with route, status and version, never ids, queries or bodies', async () => {
  process.env.APP_VERSION = 'abc1234';
  const lines = [];
  try {
    await withServer({ log: (l) => lines.push(JSON.parse(l)) }, async (base) => {
      await fetch(`${base}/api/health`);
      const c = await fetch(`${base}/api/boards`, { method: 'POST', body: JSON.stringify({ title: 'secret-title' }) });
      const { id } = await c.json();
      await fetch(`${base}/api/boards/${id}?token=hunter2`);
      await fetch(`${base}/nope`);
    });
  } finally { delete process.env.APP_VERSION; }
  await new Promise((r) => setTimeout(r, 20));
  assert.deepStrictEqual(lines.map((l) => [l.method, l.route, l.status]),
    [['POST', '/boards', 201], ['GET', '/boards/:id', 200], ['GET', '/nope', 404]]);
  assert.ok(lines.every((l) => l.msg === 'request' && l.version === 'abc1234' && typeof l.ms === 'number'));
  assert.ok(!JSON.stringify(lines).match(/secret-title|hunter2/));
});
