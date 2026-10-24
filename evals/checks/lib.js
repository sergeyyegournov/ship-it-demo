// Starts the app under test (APP_DIR) on a random port and gives checks a tiny client.
const path = require('node:path');

async function withApp(fn) {
  const { createApp } = require(path.resolve(process.env.APP_DIR || '.', 'src/app.js'));
  const server = createApp();
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (method, p, body) =>
    fetch(base + p, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  try { await fn(call); } finally { server.close(); }
}

function expect(cond, msg) {
  if (!cond) { console.error('FAIL: ' + msg); process.exit(1); }
}

module.exports = { withApp, expect };
