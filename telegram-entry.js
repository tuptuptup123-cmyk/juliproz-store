// Compatibility for existing BotFather /shop URLs. Keep the same origin so
// carts, favourites, consent and Telegram launch fragments survive the split.
(() => {
  'use strict';
  const hosts = new Set(['juliproz.com', 'www.juliproz.com', 'juliproz-store.vercel.app']);
  if (!hosts.has(location.hostname) || !['/', '/index.html'].includes(location.pathname)) return;
  let redirected = false;
  function routeTelegram() {
    if (redirected) return;
    const hash = new URLSearchParams(location.hash.slice(1));
    const app = window.Telegram?.WebApp;
    const launched = Boolean(hash.get('tgWebAppData') || hash.get('tgWebAppVersion') ||
      (hash.get('tgWebAppPlatform') && hash.get('tgWebAppPlatform') !== 'unknown') ||
      app?.initData || (app?.platform && app.platform !== 'unknown'));
    if (!launched) return;
    redirected = true;
    location.replace('/telegram/' + location.search + location.hash);
  }
  routeTelegram();
  document.addEventListener('load', event => {
    if (event.target.id === 'telegramSdk') routeTelegram();
  }, true);
  window.addEventListener('pageshow', routeTelegram);
})();
