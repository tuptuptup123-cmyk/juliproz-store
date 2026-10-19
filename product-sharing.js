(function(root){
 'use strict';
 function links(product,options={}){
  const id=String(product?.id??'');
  if(!/^(?:[1-9]\d{0,18}|[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i.test(id)||product.available===false)return null;
  const english=!options.inTelegram&&(options.language==='en'||root.SiteLanguage?.language==='en');
  const web='https://www.juliproz.com/product/'+encodeURIComponent(id)+(english?'?lang=en':'');
  const bot='https://t.me/JuliProzBot/shop?startapp=p_'+encodeURIComponent(id);
  const url=options.inTelegram?bot:web;
  // Deliberately select public fields: never serialize admin records or the current URL.
  const originalTitle=String(options.title||[product.brand,product.name].filter(Boolean).join(' — ')||'Вещь JULI.PROZ').slice(0,240);
  const title=english&&root.SiteLanguage?root.SiteLanguage.english(originalTitle):originalTitle;
  const originalSize=String(options.size||'').slice(0,100);
  const size=english&&root.SiteLanguage?root.SiteLanguage.english(originalSize):originalSize;
  const text=title+(size?(english?'\nSize / option: ':'\nРазмер / вариант: ')+size:'')+(english?'\nReference: ':'\nАртикул: ')+id;
  const message=(english?'Hello! I would like to ask about this piece:\n':'Здравствуйте! Хочу уточнить по этой вещи:\n')+text+'\n'+url;
  const manager=root.SiteLanguage?.managerLink?root.SiteLanguage.managerLink(message,{language:english?'en':'ru',inTelegram:options.inTelegram}):'https://t.me/juliproz?text='+encodeURIComponent(message);
  return {id,title,size,url,web,bot,telegram:'https://t.me/share/url?url='+encodeURIComponent(url)+'&text='+encodeURIComponent(text),manager};
 }
 function inTelegram(){
  if(root.document?.documentElement?.dataset?.storefront==='telegram')return true;
  const app=root.Telegram?.WebApp;
  // The SDK also loads on the website, where initData is empty and platform is unknown.
  if(app&&(typeof app.initData==='string'&&app.initData.length>0||typeof app.platform==='string'&&app.platform!==''&&app.platform!=='unknown'))return true;
  // Telegram launch parameters are available even while its async SDK is loading.
  // This chooses a public link format only; it is never used for authentication.
  const platform=new URLSearchParams(root.location?.hash?.slice(1)||'').get('tgWebAppPlatform');
  return Boolean(platform&&platform!=='unknown');
 }
 let dialog=null,current=null,opener=null,epoch=0,nativeShare=null;
 function externalLink(url){
  const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.hidden=true;dialog.append(link);link.click();link.remove();
 }
 async function shareTelegram(data,version,status,button){
  const tg=root.Telegram?.WebApp;
  // openTelegramLink(share/url) can silently do nothing in a Mini App. Use
  // Telegram's recipient picker and wait for its real sent/cancelled callback.
  if(inTelegram()&&tg?.initData&&tg?.shareMessage&&tg.isVersionAtLeast?.('8.0')){
   if(nativeShare){status.textContent='Отправка уже открывается. Завершите её в окне Telegram.';return}
   button.disabled=true;status.textContent='Готовим вещь к отправке…';
   const attempt={};nativeShare=attempt;
   let finished=false,timer=null,cancelTimer=null,stage='request';
   const messages={
    SENT:'Вещь отправлена.',USER_DECLINED:'Вещь не отправлена. Можно попробовать ещё раз.',
    UNSUPPORTED:'Эта версия Telegram не поддерживает отправку карточки. Обновите Telegram или скопируйте ссылку ниже.',
    MESSAGE_EXPIRED:'Telegram не смог открыть карточку. Нажмите «Отправить в Telegram» ещё раз.',
    MESSAGE_SEND_FAILED:'Telegram не смог отправить карточку. Попробуйте ещё раз или выберите другой чат.',
    UNKNOWN_ERROR:'Telegram сообщил об ошибке отправки. Закройте магазин и откройте его заново.',
    NO_RESPONSE:'Telegram не открыл окно отправки. Полностью закройте магазин и откройте его заново.',
    SDK_BUSY:'Telegram считает предыдущее окно отправки открытым. Полностью закройте магазин и откройте его заново.',
    SDK_ERROR:'Не удалось открыть окно Telegram. Полностью закройте магазин и откройте его заново.',
    INVALID_RESPONSE:'Не удалось подготовить карточку. Попробуйте ещё раз.',
    REQUEST_FAILED:'Не удалось открыть отправку. Попробуйте ещё раз или скопируйте ссылку ниже.'
   };
   function report(result){
    // Only a fixed result code and public product reference are reported.
    fetch('https://www.juliproz.com/api/telegram-share',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',keepalive:true,signal:AbortSignal.timeout(5000),
     body:JSON.stringify({action:'report',init_data:tg.initData,product_id:data.id,result})}).catch(()=>{});
   }
   function finish(result){
    if(finished)return;finished=true;clearTimeout(timer);clearTimeout(cancelTimer);
    tg.offEvent?.('shareMessageFailed',failed);tg.offEvent?.('shareMessageSent',sent);
    if(nativeShare===attempt)nativeShare=null;
    if(version===epoch){status.textContent=messages[result];button.disabled=false}
    report(result);
   }
   function failed(event){finish(['USER_DECLINED','UNSUPPORTED','MESSAGE_EXPIRED','MESSAGE_SEND_FAILED'].includes(event?.error)?event.error:'UNKNOWN_ERROR')}
   function sent(){finish('SENT')}
   try{
    const response=await fetch('https://www.juliproz.com/api/telegram-share',{
     method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',signal:AbortSignal.timeout(15000),
     body:JSON.stringify({init_data:tg.initData,product_id:data.id,size:data.size})
    });
    if(!response.ok)throw Error();
    stage='response';
    const prepared=await response.json();
    // Freshness is checked by the server and Telegram. A wrong device clock
    // must not reject a valid, freshly prepared message before the SDK sees it.
    if(typeof prepared.id!=='string'||!prepared.id||!Number.isSafeInteger(prepared.expiration_date)||prepared.expiration_date<=0)throw Error();
    if(version!==epoch){if(nativeShare===attempt)nativeShare=null;return}
    stage='sdk';status.textContent='Открываем окно отправки в Telegram…';
    tg.onEvent?.('shareMessageFailed',failed);tg.onEvent?.('shareMessageSent',sent);
    timer=setTimeout(()=>{
     // A user can spend longer than 30s choosing a recipient. Keep listening
     // and keep the button locked until the actual Telegram result arrives.
     report('NO_RESPONSE');
     if(version===epoch)status.textContent='Если окно Telegram не появилось, полностью закройте магазин и откройте его заново.';
    },30000);
    tg.shareMessage(prepared.id,shared=>{
     if(shared)sent();
     // The official SDK calls callback(false) before shareMessageFailed. Let
     // that event supply the real reason instead of treating every error as cancel.
     else if(!finished)cancelTimer=setTimeout(()=>finish('USER_DECLINED'),0);
    });
   }catch(error){
    finish(stage==='request'?'REQUEST_FAILED':stage==='response'?'INVALID_RESPONSE':error?.message==='WebAppShareMessageOpened'?'SDK_BUSY':error?.message==='WebAppMethodUnsupported'?'UNSUPPORTED':'SDK_ERROR');
   }
   return;
  }
  try{
   // Older clients open the official sharing page outside the Mini App.
   if(inTelegram()&&tg?.openLink)tg.openLink(data.telegram);
   else externalLink(data.telegram);
   status.textContent='Если Telegram не открылся, скопируйте ссылку ниже.';
  }catch{status.textContent='Не удалось открыть Telegram. Скопируйте ссылку ниже.'}
 }
 function close(){if(dialog?.open)dialog.close();current=null;epoch++}
 function create(){
  dialog=document.createElement('dialog');dialog.id='productShareDialog';dialog.className='product-share-dialog';
  dialog.setAttribute('aria-labelledby','productShareTitle');
  dialog.innerHTML='<div class="product-share-heading"><h2 id="productShareTitle">Поделиться вещью</h2><button type="button" data-share-close aria-label="Закрыть">✕</button></div><p class="product-share-name"></p><div class="product-share-actions"><button type="button" data-share-action="telegram">Отправить в Telegram <svg class="inline-arrow" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12"/></svg></button><button type="button" data-share-action="manager">Написать менеджеру <svg class="inline-arrow" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12"/></svg></button></div><label class="product-share-label" for="productShareUrl">Ссылка на вещь на сайте</label><input id="productShareUrl" readonly type="url"><button type="button" class="product-share-copy" data-share-action="copy">Скопировать ссылку</button><p class="product-share-status" role="status" aria-live="polite"></p>';
  document.body.append(dialog);
  dialog.addEventListener('keydown',e=>{
   e.stopPropagation(); // Do not trigger the underlying product's Escape/Tab handlers.
   if(e.key==='Tab'){
    const nodes=[...dialog.querySelectorAll('button:not([disabled]),input')],first=nodes[0],last=nodes.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
   }
  });
  dialog.addEventListener('close',()=>{if(dialog.open)return;current=null;epoch++;dialog.querySelector('#productShareUrl').value='';dialog.querySelector('.product-share-name').textContent='';dialog.querySelector('.product-share-status').textContent='';if(opener?.isConnected)opener.focus();opener=null});
  dialog.addEventListener('click',async e=>{
   if(e.target===dialog||e.target.closest('[data-share-close]')){close();return}
   const action=e.target.closest('[data-share-action]')?.dataset.shareAction;
   if(!action||!current)return;
   const data=current,version=epoch,status=dialog.querySelector('.product-share-status');
   if(action==='copy'){
    try{await navigator.clipboard.writeText(data.url);if(version===epoch)status.textContent='Ссылка скопирована. Можно отправить клиенту или менеджеру.'}
    catch{if(version!==epoch)return;const field=dialog.querySelector('#productShareUrl');field.focus();field.select();status.textContent='Не удалось скопировать автоматически. Скопируйте выделенную ссылку.'}
    return;
   }
   if(action==='telegram'){await shareTelegram(data,version,status,e.target.closest('[data-share-action]'));return}
   const url=action==='manager'?data.manager:null;if(!url)return;
   try{
    if(inTelegram()&&root.Telegram?.WebApp?.openTelegramLink)root.Telegram.WebApp.openTelegramLink(url);
    else externalLink(url);
    if(action==='manager')root.StoreAnalytics?.track('manager_product',data.id);
    status.textContent=action==='telegram'?'Выберите получателя и отправьте сообщение в Telegram.':'Отправьте подготовленное сообщение менеджеру в Telegram.';
   }catch{status.textContent=action==='manager'?'Не удалось открыть чат. Скопируйте ссылку ниже.':'Не удалось открыть Telegram. Скопируйте ссылку ниже.'}
  });
 }
 function open(product,options={}){
  const telegram=inTelegram(),data=links(product,{...options,inTelegram:telegram});if(!data)return false;
  if(!dialog)create();
  current=data;epoch++;opener=document.activeElement;
  dialog.querySelector('[data-share-action=telegram]').disabled=false;
  dialog.querySelector('.product-share-name').textContent=data.title;
  dialog.querySelector('#productShareUrl').value=data.url;
  dialog.querySelector('.product-share-label').textContent=telegram?'Ссылка на вещь в Telegram':'Ссылка на вещь на сайте';
  dialog.querySelector('.product-share-status').textContent=options.note||'';
  if(!dialog.open)dialog.showModal();
  return true;
 }
 const api={links,open,close};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.ProductSharing=api;
})(typeof window==='undefined'?globalThis:window);
