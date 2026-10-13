(function(root){
 'use strict';
 function links(product,options={}){
  const id=String(product?.id??'');
  if(!/^(?:[1-9]\d{0,18}|[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i.test(id)||product.available===false)return null;
  const web='https://www.juliproz.com/?product='+encodeURIComponent(id);
  const bot='https://t.me/JuliProzBot/shop?startapp=p_'+encodeURIComponent(id);
  const url=options.inTelegram?bot:web;
  // Deliberately select public fields: never serialize admin records or the current URL.
  const title=String(options.title||[product.brand,product.name].filter(Boolean).join(' — ')||'Вещь JULI.PROZ').slice(0,240);
  const size=String(options.size||'').slice(0,100);
  const text=title+(size?'\nРазмер / вариант: '+size:'')+'\nАртикул: '+id;
  return {id,title,url,web,bot,telegram:'https://t.me/share/url?url='+encodeURIComponent(url)+'&text='+encodeURIComponent(text),manager:'https://t.me/juliproz?text='+encodeURIComponent('Здравствуйте! Хочу уточнить по этой вещи:\n'+text+'\n'+url)};
 }
 function inTelegram(){
  const app=root.Telegram?.WebApp;
  // The SDK also loads on the website, where initData is empty and platform is unknown.
  return Boolean(app&&(typeof app.initData==='string'&&app.initData.length>0||typeof app.platform==='string'&&app.platform!==''&&app.platform!=='unknown'));
 }
 let dialog=null,current=null,opener=null,epoch=0;
 function close(){if(dialog?.open)dialog.close();current=null;epoch++}
 function create(){
  dialog=document.createElement('dialog');dialog.id='productShareDialog';dialog.className='product-share-dialog';
  dialog.setAttribute('aria-labelledby','productShareTitle');
  dialog.innerHTML='<div class="product-share-heading"><h2 id="productShareTitle">Поделиться вещью</h2><button type="button" data-share-close aria-label="Закрыть">✕</button></div><p class="product-share-name"></p><div class="product-share-actions"><button type="button" data-share-action="telegram">Отправить в Telegram <span aria-hidden="true">↗</span></button><button type="button" data-share-action="manager">Написать менеджеру <span aria-hidden="true">↗</span></button></div><label class="product-share-label" for="productShareUrl">Ссылка на вещь на сайте</label><input id="productShareUrl" readonly type="url"><button type="button" class="product-share-copy" data-share-action="copy">Скопировать ссылку</button><p class="product-share-status" role="status" aria-live="polite"></p>';
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
   const url=action==='telegram'?data.telegram:action==='manager'?data.manager:null;if(!url)return;
   try{
    if(inTelegram()&&root.Telegram?.WebApp?.openTelegramLink)root.Telegram.WebApp.openTelegramLink(url);
    else {const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.hidden=true;dialog.append(link);link.click();link.remove()}
    if(action==='manager')root.StoreAnalytics?.track('manager_product',data.id);
    status.textContent=action==='telegram'?'Выберите получателя и отправьте сообщение в Telegram.':'Отправьте подготовленное сообщение менеджеру в Telegram.';
   }catch{status.textContent='Не удалось открыть Telegram. Скопируйте ссылку ниже.'}
  });
 }
 function open(product,options={}){
  const telegram=inTelegram(),data=links(product,{...options,inTelegram:telegram});if(!data)return false;
  if(!dialog)create();
  current=data;epoch++;opener=document.activeElement;
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
