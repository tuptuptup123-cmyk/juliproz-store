// Never forward old tokens, query parameters, or fragments to another origin.
(() => {
  try { localStorage.removeItem('jpAdminSessionV1'); } catch {}
  try { sessionStorage.removeItem('jpAdminSessionV1'); } catch {}
  try { history.replaceState(null, '', '/admin.html'); } catch {}
  location.replace('https://admin.juliproz.com/admin.html');
})();
