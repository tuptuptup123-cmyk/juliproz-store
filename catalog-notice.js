(() => {
  'use strict';
  const dialog = document.getElementById('catalogAntiScam');
  const nav = document.querySelector('.bottom-nav');
  const product = document.getElementById('productModal');
  const menu = document.getElementById('catalogMenu');
  const sheet = document.getElementById('sheet');
  if (!dialog || !nav || typeof dialog.showModal !== 'function') return;

  const key = 'jpAntiScamSeenV1';
  let dismissed = false, timer = null, enteredCatalog = false, openedProduct = false;
  const visible = node => node && !node.classList.contains('hidden');
  const inCatalog = () => nav.querySelector('[data-tab="catalog"]')?.getAttribute('aria-current') === 'page';
  function seen() {
    if (dismissed) return true;
    try { if (localStorage.getItem(key) === '1') return true; } catch {}
    try { return sessionStorage.getItem(key) === '1'; } catch { return false; }
  }
  function remember() {
    dismissed = true;
    try { localStorage.setItem(key, '1'); } catch {}
    try { sessionStorage.setItem(key, '1'); } catch {}
  }
  function linkedProductPending() {
    if (enteredCatalog || openedProduct) return false;
    const query = new URLSearchParams(location.search);
    const start = window.Telegram?.WebApp?.initDataUnsafe?.start_param || query.get('tgWebAppStartParam') || query.get('startapp');
    return query.has('product') || Boolean(start?.startsWith('p_'));
  }
  function ready() {
    return inCatalog() && !seen() && !linkedProductPending() &&
      !visible(product) && !visible(menu) && !visible(sheet) &&
      document.visibilityState !== 'hidden' && !document.querySelector('dialog[open]');
  }
  function sync() {
    clearTimeout(timer);
    if (visible(product)) openedProduct = true;
    if (dialog.open && (!inCatalog() || visible(product) || seen())) dialog.close();
    if (!ready()) return;
    timer = setTimeout(() => {
      if (!ready()) return;
      dialog.showModal();
      document.getElementById('acknowledgeAntiScam').focus({preventScroll:true});
    }, 450);
  }
  function dismiss() {
    remember();
    clearTimeout(timer);
    if (dialog.open) dialog.close();
  }
  document.getElementById('closeAntiScam').addEventListener('click', dismiss);
  document.getElementById('acknowledgeAntiScam').addEventListener('click', dismiss);
  dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
  document.addEventListener('click', event => {
    const link = event.target.closest('[data-tab="catalog"],[data-web-section="catalog"]');
    if (link) { enteredCatalog = true; sync(); }
  });
  const observer = new MutationObserver(sync);
  observer.observe(nav, {subtree:true, attributes:true, attributeFilter:['aria-current','class']});
  for (const node of [product, menu, sheet]) if (node) observer.observe(node, {attributes:true, attributeFilter:['class']});
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('storage', event => { if (event.key === key && event.newValue === '1') dismiss(); });
  sync();
})();
