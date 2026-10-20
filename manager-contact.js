(function(root){
 'use strict';
 let dialog=null,current=null,opener=null;
 function destination(value){
  try{
   const url=new URL(value);
   if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash)return null;
   const telegram=url.hostname==='t.me'&&url.pathname==='/juliproz';
   const whatsapp=url.hostname==='wa.me'&&['/971585394347','/message/LX6SBE3QCQXKG1'].includes(url.pathname);
   if(!telegram&&!whatsapp||[...url.searchParams.keys()].some(key=>key!=='text'))return null;
   return {url:url.href,message:url.searchParams.get('text')||'',telegram};
  }catch{return null}
 }
 function inTelegram(){
  const app=root.Telegram?.WebApp;
  if(app&&(app.initData||app.platform&&app.platform!=='unknown'))return true;
  return [root.location?.hash?.slice(1),root.location?.search?.slice(1)].some(value=>{
   const p=new URLSearchParams(value||'');
   return p.has('tgWebAppData')||p.has('tgWebAppVersion')||Boolean(p.get('tgWebAppPlatform')&&p.get('tgWebAppPlatform')!=='unknown');
  });
 }
 function t(ru,en){return current?.english?en:ru}
 function navigate(data){
  const app=root.Telegram?.WebApp;
  try{
   if(data.telegram&&inTelegram()&&typeof app?.openTelegramLink==='function'){
    app.openTelegramLink(data.url);
    // Let Telegram resolve the recipient and show the chat. Closing the view
    // immediately can interrupt an asynchronous handoff in the native client.
   }else{
    // Checkout awaits stock validation. Same-tab navigation does not need a
    // popup permission, unlike window.open(..., '_blank') after that await.
    root.open(data.url,'_self','noopener');
   }
  }catch{
   if(!dialog?.open)prepare(data);
   dialog.querySelector('[data-contact-status]').textContent=t('Не удалось открыть чат. Попробуйте ссылку ниже или скопируйте сообщение.','Could not open the chat. Try the link below or copy your message.');
  }
 }
 function close(){if(dialog?.open)dialog.close()}
 function create(){
  dialog=document.createElement('dialog');dialog.id='managerContactDialog';dialog.className='manager-contact-dialog';dialog.setAttribute('aria-labelledby','managerContactTitle');
  dialog.innerHTML='<div class="manager-contact-heading"><h2 id="managerContactTitle"></h2><button type="button" data-contact-close>✕</button></div><p data-contact-intro></p><label for="managerContactMessage" data-contact-label></label><textarea id="managerContactMessage" readonly rows="6"></textarea><a data-contact-open target="_blank" rel="noopener noreferrer" class="manager-contact-primary"></a><button type="button" data-contact-copy></button><p data-contact-status role="status" aria-live="polite"></p><details><summary data-contact-help></summary><a data-contact-external target="_blank" rel="noopener noreferrer"></a><p data-contact-fallback></p><a data-contact-plain target="_blank" rel="noopener noreferrer"></a></details>';
  document.body.append(dialog);
  dialog.addEventListener('keydown',e=>e.stopPropagation());
  dialog.addEventListener('close',()=>{if(dialog.open)return;current=null;dialog.querySelector('textarea').value='';if(opener?.isConnected)opener.focus({preventScroll:true});opener=null});
  dialog.addEventListener('click',async e=>{
   if(e.target===dialog||e.target.closest('[data-contact-close]')){close();return}
   if(!current)return;
   const data=current;
   if(e.target.closest('[data-contact-copy]')){
    try{await navigator.clipboard.writeText(data.message);if(current===data)dialog.querySelector('[data-contact-status]').textContent=t('Сообщение скопировано. Вставьте его в чат с менеджером.','Message copied. Paste it into the chat with our manager.')}
    catch{if(current!==data)return;const field=dialog.querySelector('textarea');field.focus();field.select();dialog.querySelector('[data-contact-status]').textContent=t('Скопируйте выделенный текст и отправьте его менеджеру.','Copy the selected text and send it to our manager.')}
   }
   if(e.target.closest('[data-contact-open],[data-contact-external],[data-contact-plain]')){
    // A visible recovery link must not repeat the SDK call that just failed.
    // Keep the browser's normal anchor navigation and the current draft intact.
    // Also avoid the SDK's delegated iframe link handler in Telegram Web.
    e.stopPropagation();
   }
  });
 }
 function prepare(data){
  if(!dialog)create();
  current={...data,english:!data.telegram};opener=document.activeElement;
  dialog.querySelector('h2').textContent=t('Связаться с менеджером','Contact our manager');
  dialog.querySelector('[data-contact-close]').setAttribute('aria-label',t('Закрыть','Close'));
  dialog.querySelector('[data-contact-intro]').textContent=t('Отправьте сообщение в чате с @juliproz. Доставку и оплату согласуем лично.','Send your message in WhatsApp. We will arrange delivery and payment with you.');
  dialog.querySelector('[data-contact-label]').textContent=t('Ваше сообщение','Your message');
  dialog.querySelector('textarea').value=data.message;
  dialog.querySelector('textarea').hidden=!data.message;dialog.querySelector('[data-contact-label]').hidden=!data.message;
  const primary=dialog.querySelector('[data-contact-open]');primary.href=data.url;primary.textContent=t('Открыть чат в Telegram','Open WhatsApp chat');
  const copy=dialog.querySelector('[data-contact-copy]');copy.hidden=!data.message;copy.textContent=t('Скопировать сообщение','Copy message');
  dialog.querySelector('[data-contact-status]').textContent=t('Сообщение ещё не отправлено. Нажмите «Отправить» в чате с менеджером.','Your message has not been sent yet. Tap Send in the chat with our manager.');
  dialog.querySelector('[data-contact-help]').textContent=t('Чат не открылся?','Chat did not open?');
  const external=dialog.querySelector('[data-contact-external]');external.href=data.url;external.textContent=t('Открыть через браузер','Open in browser');external.hidden=!inTelegram();
  dialog.querySelector('[data-contact-fallback]').textContent=t('Скопируйте сообщение выше и откройте контакт напрямую:','Copy the message above and open our contact directly:');
  const plain=dialog.querySelector('[data-contact-plain]');plain.href=data.telegram?'https://t.me/juliproz':'https://wa.me/message/LX6SBE3QCQXKG1';plain.textContent=data.telegram?'@juliproz':'WhatsApp';
  dialog.querySelector('details').open=false;
  if(!dialog.open)dialog.showModal();
  primary.focus({preventScroll:true});
 }
 function open(value){
  const data=destination(value);if(!data)return false;
  // Native SDK navigation has no success callback. Keep an accessible draft
  // ready if the client stays open. Ordinary browsers navigate in the same tab.
  if(inTelegram())prepare(data);
  navigate(data);
  return true;
 }
 const api={open,close,destination};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.ManagerContact=api;
})(typeof window==='undefined'?globalThis:window);
