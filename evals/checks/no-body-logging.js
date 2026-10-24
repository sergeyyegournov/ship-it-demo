// Run the server, send a body containing a marker, and assert the marker never reaches stdout/stderr.
const { spawn } = require('node:child_process');
const path = require('node:path');
const dir = path.resolve(process.env.APP_DIR || '.');
const MARK = 'SECRET-MARKER-12345';
const port = 4100 + Math.floor(Math.random() * 500);
const p = spawn(process.execPath, ['src/server.js'], { cwd: dir, env: { ...process.env, PORT: String(port) } });
let out = '';
p.stdout.on('data', (d) => (out += d));
p.stderr.on('data', (d) => (out += d));
setTimeout(async () => {
  await fetch(`http://127.0.0.1:${port}/boards`, { method: 'POST', body: JSON.stringify({ title: MARK }) });
  setTimeout(() => {
    p.kill();
    if (out.includes(MARK)) { console.error('FAIL: request body logged'); process.exit(1); }
    if (!/POST/.test(out)) { console.error('FAIL: no request logging found'); process.exit(1); }
    process.exit(0);
  }, 500);
}, 700);
