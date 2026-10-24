const path = require('node:path');
const { withApp, expect } = require('./lib');
const want = require(path.resolve(process.env.APP_DIR || '.', 'package.json')).version;
withApp(async (call) => {
  const j = await (await call('GET', '/health')).json();
  expect(j.ok === true, 'ok must stay true');
  expect(j.version === want, `version ${j.version} != ${want}`);
});
