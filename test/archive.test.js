const test = require('node:test');
const assert = require('node:assert');
const net = require('node:net');
const { createApp } = require('../src/app');

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

async function withServer(fn) {
  const server = createApp();
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try { await fn(base, port); } finally { server.close(); }
}

async function createBoard(base, title = 'Board') {
  const r = await fetch(`${base}/boards`, { method: 'POST', body: JSON.stringify({ title }) });
  assert.strictEqual(r.status, 201);
  return r.json();
}

async function getBoard(base, id) {
  const r = await fetch(`${base}/boards/${id}`);
  assert.strictEqual(r.status, 200);
  return r.json();
}

function post(base, path, body) {
  return fetch(`${base}${path}`, body === undefined ? { method: 'POST' } : { method: 'POST', body });
}

async function listIds(base, query = '') {
  const r = await fetch(`${base}/boards${query}`);
  assert.strictEqual(r.status, 200);
  return (await r.json()).map((b) => b.id);
}

// Sends raw bytes over a socket and collects everything the server writes until it closes or the timeout fires.
function rawRequest(port, write, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, '127.0.0.1');
    let data = '';
    const timer = setTimeout(() => { sock.destroy(); reject(new Error('timed out')); }, timeoutMs);
    sock.on('data', (c) => (data += c));
    sock.on('close', () => { clearTimeout(timer); resolve(data); });
    sock.on('error', (e) => { clearTimeout(timer); reject(e); });
    sock.on('connect', () => write(sock));
  });
}

test('R1: new board has archived:false and archivedAt:null everywhere', async () => {
  await withServer(async (base) => {
    const board = await createBoard(base, 'Shape');
    assert.strictEqual(board.archived, false);
    assert.strictEqual(board.archivedAt, null);
    const fetched = await getBoard(base, board.id);
    assert.deepStrictEqual(fetched, board);
    const list = await (await fetch(`${base}/boards`)).json();
    assert.deepStrictEqual(list.find((b) => b.id === board.id), board);
  });
});

test('R2/R3: archive sets archivedAt to now and is idempotent', async () => {
  await withServer(async (base) => {
    const board = await createBoard(base);
    const r1 = await post(base, `/boards/${board.id}/archive`);
    assert.strictEqual(r1.status, 200);
    const a1 = await r1.json();
    assert.strictEqual(a1.archived, true);
    assert.match(a1.archivedAt, ISO);
    assert.ok(Math.abs(Date.parse(a1.archivedAt) - Date.now()) < 5000);

    const r2 = await post(base, `/boards/${board.id}/archive`);
    assert.strictEqual(r2.status, 200);
    assert.deepStrictEqual(await r2.json(), a1);
  });
});

test('R4/R5: unarchive clears fields and is idempotent', async () => {
  await withServer(async (base) => {
    const board = await createBoard(base);
    const r0 = await post(base, `/boards/${board.id}/unarchive`);
    assert.strictEqual(r0.status, 200);
    assert.deepStrictEqual(await r0.json(), board);

    await post(base, `/boards/${board.id}/archive`);
    const r1 = await post(base, `/boards/${board.id}/unarchive`);
    assert.strictEqual(r1.status, 200);
    const u = await r1.json();
    assert.strictEqual(u.archived, false);
    assert.strictEqual(u.archivedAt, null);
  });
});

test('R6: archive keeps id/title/status; unarchive restores pre-archive state', async () => {
  await withServer(async (base) => {
    const board = await createBoard(base, 'Keep me');
    const archived = await (await post(base, `/boards/${board.id}/archive`)).json();
    assert.strictEqual(archived.id, board.id);
    assert.strictEqual(archived.title, board.title);
    assert.strictEqual(archived.status, board.status);
    await post(base, `/boards/${board.id}/unarchive`);
    assert.deepStrictEqual(await getBoard(base, board.id), board);
  });
});

test('R7/R8: list filters by archived', async () => {
  await withServer(async (base) => {
    const active = await createBoard(base, 'active');
    const gone = await createBoard(base, 'archived');
    await post(base, `/boards/${gone.id}/archive`);

    for (const q of ['', '?', '?archived=false']) {
      const ids = await listIds(base, q);
      assert.ok(ids.includes(active.id), `active in ${q}`);
      assert.ok(!ids.includes(gone.id), `archived not in ${q}`);
    }
    const archivedIds = await listIds(base, '?archived=true');
    assert.ok(archivedIds.includes(gone.id));
    assert.ok(!archivedIds.includes(active.id));
  });
});

test('R9: GET /boards/:id returns archived boards', async () => {
  await withServer(async (base) => {
    const board = await createBoard(base);
    await post(base, `/boards/${board.id}/archive`);
    const fetched = await getBoard(base, board.id);
    assert.strictEqual(fetched.archived, true);
  });
});

test('R10: unknown id returns 404 and creates nothing', async () => {
  await withServer(async (base) => {
    const before = (await listIds(base, '?archived=false')).length + (await listIds(base, '?archived=true')).length;
    for (const action of ['archive', 'unarchive']) {
      for (const id of ['999999', '123456789012345678901234567890']) {
        const r = await post(base, `/boards/${id}/${action}`);
        assert.strictEqual(r.status, 404, `${action} ${id}`);
        assert.deepStrictEqual(await r.json(), { error: 'not found' });
      }
    }
    const after = (await listIds(base, '?archived=false')).length + (await listIds(base, '?archived=true')).length;
    assert.strictEqual(after, before);
  });
});

test('R11: invalid list query returns 400', async () => {
  await withServer(async (base) => {
    for (const q of ['?archived=yes', '?archived=', '?archived=TRUE', '?archived=1',
      '?archived=true&archived=true', '?foo=1', '?archived=true&foo=1']) {
      const r = await fetch(`${base}/boards${q}`);
      assert.strictEqual(r.status, 400, q);
      assert.deepStrictEqual(await r.json(), { error: 'invalid query' }, q);
    }
  });
});

test('R12/R14: invalid bodies return 400 and leave the board unchanged', async () => {
  await withServer(async (base) => {
    const bad = ['not json', '[]', '"x"', 'null', '{"archived":true}', `{"x":"${'a'.repeat(1017)}"}`];
    assert.strictEqual(Buffer.byteLength(bad[5]), 1025);
    for (const action of ['archive', 'unarchive']) {
      const board = await createBoard(base);
      if (action === 'unarchive') await post(base, `/boards/${board.id}/archive`);
      const before = await getBoard(base, board.id);
      for (const body of bad) {
        const r = await post(base, `/boards/${board.id}/${action}`, body);
        assert.strictEqual(r.status, 400, `${action} ${body.slice(0, 20)}`);
        assert.deepStrictEqual(await r.json(), { error: 'invalid body' });
        assert.deepStrictEqual(await getBoard(base, board.id), before);
      }
    }
  });
});

test('R12: empty body and {} are accepted', async () => {
  await withServer(async (base) => {
    const board = await createBoard(base);
    assert.strictEqual((await post(base, `/boards/${board.id}/archive`, '')).status, 200);
    assert.strictEqual((await post(base, `/boards/${board.id}/unarchive`, '{}')).status, 200);
    assert.strictEqual((await post(base, `/boards/${board.id}/archive`, '{}')).status, 200);
    assert.strictEqual((await getBoard(base, board.id)).archived, true);
  });
});

test('other methods on archive/unarchive return 404 and change nothing', async () => {
  await withServer(async (base) => {
    const board = await createBoard(base);
    for (const action of ['archive', 'unarchive']) {
      const r = await fetch(`${base}/boards/${board.id}/${action}`);
      assert.strictEqual(r.status, 404);
      assert.deepStrictEqual(await r.json(), { error: 'not found' });
    }
    assert.deepStrictEqual(await getBoard(base, board.id), board);
  });
});

test('R13: client aborting mid-body does not crash the server', async () => {
  await withServer(async (base, port) => {
    const board = await createBoard(base);
    await new Promise((resolve) => {
      const sock = net.connect(port, '127.0.0.1', () => {
        sock.write(`POST /boards/${board.id}/archive HTTP/1.1\r\nHost: x\r\nContent-Length: 100\r\n\r\n{"a":`);
        setTimeout(() => { sock.destroy(); resolve(); }, 50);
      });
      sock.on('error', () => {});
    });
    const h = await fetch(`${base}/health`);
    assert.strictEqual(h.status, 200);
    assert.deepStrictEqual(await getBoard(base, board.id), board);
  });
});

test('R13/R14: large chunked body gets a 400 response without hanging', async () => {
  await withServer(async (base, port) => {
    const board = await createBoard(base);
    const chunk = 'a'.repeat(512);
    const out = await rawRequest(port, (sock) => {
      let req = `POST /boards/${board.id}/archive HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n`;
      for (let i = 0; i < 8; i++) req += `${chunk.length.toString(16)}\r\n${chunk}\r\n`;
      req += '0\r\n\r\n';
      sock.write(req);
    });
    assert.match(out, /^HTTP\/1\.1 400 /);
    assert.ok(out.includes('{"error":"invalid body"}'), out);
    assert.deepStrictEqual(await getBoard(base, board.id), board);
  });
});
