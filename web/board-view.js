// Pure view logic for the SPA, kept free of the DOM so node:test can cover it.
(function (root) {
  function sortBoards(boards) {
    return [...boards].sort((a, b) => a.title.localeCompare(b.title) || a.id - b.id);
  }

  function validateTitle(raw) {
    const title = String(raw || '').trim();
    if (!title) return { ok: false, error: 'Give the board a title.' };
    if (title.length > 80) return { ok: false, error: 'Titles are limited to 80 characters.' };
    return { ok: true, title };
  }

  function summary(active, archived) {
    const a = active.length;
    const z = archived.length;
    return `${a} active board${a === 1 ? '' : 's'}` + (z ? `, ${z} archived` : '');
  }

  const api = { sortBoards, validateTitle, summary };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BoardView = api;
})(typeof window !== 'undefined' ? window : globalThis);
