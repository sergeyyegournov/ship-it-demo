// Minimal dependency-free lint: syntax-check every JS file and reject stray console.log in src/app.js.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
  });
}

let failed = false;
for (const f of ['src', 'test', 'scripts'].flatMap(walk)) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
  catch (e) { console.error(`syntax error: ${f}\n${e.stderr}`); failed = true; }
}
if (/console\.log/.test(fs.readFileSync('src/app.js', 'utf8'))) {
  console.error('console.log not allowed in src/app.js'); failed = true;
}
process.exit(failed ? 1 : 0);
