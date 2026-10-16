// Load Telegram only for a Mini App launch; ordinary visitors need no third-party SDK.
(()=>{
 const hash=new URLSearchParams(location.hash.slice(1)),query=new URLSearchParams(location.search);
 if(![hash,query].some(p=>p.has('tgWebAppData')||p.has('tgWebAppVersion')||Boolean(p.get('tgWebAppPlatform')&&p.get('tgWebAppPlatform')!=='unknown')))return;
 const script=document.createElement('script');script.id='telegramSdk';script.async=true;script.src='https://telegram.org/js/telegram-web-app.js';document.head.appendChild(script);
})();
