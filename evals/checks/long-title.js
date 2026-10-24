const { withApp, expect } = require('./lib');
withApp(async (call) => {
  expect((await call('POST', '/boards', { title: 'x'.repeat(101) })).status === 400, '101 chars should 400');
  expect((await call('POST', '/boards', { title: 'x'.repeat(100) })).status === 201, '100 chars should 201');
});
