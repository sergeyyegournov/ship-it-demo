const { withApp, expect } = require('./lib');
withApp(async (call) => {
  const b = await (await call('POST', '/boards', { title: 'd' })).json();
  expect((await call('DELETE', `/boards/${b.id}`)).status === 204, 'delete should 204');
  expect((await call('GET', `/boards/${b.id}`)).status === 404, 'deleted board should 404');
  expect((await call('DELETE', '/boards/9999')).status === 404, 'unknown id should 404');
});
