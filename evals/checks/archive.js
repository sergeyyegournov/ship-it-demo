const { withApp, expect } = require('./lib');
withApp(async (call) => {
  const b = await (await call('POST', '/boards', { title: 'a' })).json();
  const r = await call('POST', `/boards/${b.id}/archive`);
  expect(r.status === 200, `archive status ${r.status}`);
  expect((await r.json()).archived === true, 'archived flag not set');
  expect((await (await call('GET', `/boards/${b.id}`)).json()).archived === true, 'not persisted');
  expect((await call('POST', '/boards/9999/archive')).status === 404, 'unknown id should 404');
});
