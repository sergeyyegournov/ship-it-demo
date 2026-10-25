const API = '/api';
const $ = (id) => document.getElementById(id);
let showArchived = false;

async function api(method, path) {
  const res = await fetch(API + path, { method });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `request failed (${res.status})`);
  return body;
}

function showError(msg) {
  $('error').textContent = msg || '';
  $('error').hidden = !msg;
}

async function load() {
  const [active, archived] = await Promise.all([
    api('GET', '/boards'), api('GET', '/boards?archived=true'),
  ]);
  const boards = BoardView.sortBoards(showArchived ? archived : active);
  $('summary').textContent = BoardView.summary(active, archived);
  $('empty').hidden = boards.length > 0;
  $('boards').replaceChildren(...boards.map(row));
}

function row(board) {
  const li = document.createElement('li');
  const name = document.createElement('span');
  name.textContent = board.title;
  const btn = document.createElement('button');
  btn.className = 'ghost';
  btn.textContent = board.archived ? 'Unarchive' : 'Archive';
  btn.addEventListener('click', async () => {
    try { await api('POST', `/boards/${board.id}/${board.archived ? 'unarchive' : 'archive'}`); showError(''); await load(); }
    catch (e) { showError(e.message); }
  });
  li.append(name, btn);
  return li;
}

$('new-board').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const v = BoardView.validateTitle($('title').value);
  if (!v.ok) return showError(v.error);
  try {
    const res = await fetch(API + '/boards', { method: 'POST', body: JSON.stringify({ title: v.title }) });
    if (!res.ok) throw new Error((await res.json()).error || 'could not create board');
    $('title').value = '';
    showError('');
    await load();
  } catch (e) { showError(e.message); }
});

for (const [id, archived] of [['tab-active', false], ['tab-archived', true]]) {
  $(id).addEventListener('click', () => {
    showArchived = archived;
    $('tab-active').setAttribute('aria-pressed', String(!archived));
    $('tab-archived').setAttribute('aria-pressed', String(archived));
    load().catch((e) => showError(e.message));
  });
}

api('GET', '/health').then(() => { $('health').textContent = 'API up'; $('health').className = 'pill ok'; })
  .catch(() => { $('health').textContent = 'API down'; $('health').className = 'pill bad'; });
api('GET', '/version').then((v) => { $('version').textContent = v.version; }).catch(() => {});
load().catch((e) => showError(e.message));
