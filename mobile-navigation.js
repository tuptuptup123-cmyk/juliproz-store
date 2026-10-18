(()=>{
 'use strict';
 const nav=document.querySelector('.bottom-nav'),more=document.getElementById('moreNavigation'),dialog=document.getElementById('moreNavigationDialog');
 if(!nav||!more||!dialog||isTelegramStore())return;
 const compact=matchMedia('(max-width:899px)');
 function sync(){
  nav.setAttribute('aria-label',window.SiteLanguage?.language==='en'?'Main navigation':'Основные разделы');
  const active=nav.querySelector('[data-tab][aria-current="page"]');
  more.classList.toggle('active',Boolean(active?.classList.contains('mobile-secondary')));
  for(const link of dialog.querySelectorAll('[data-more-tab]')){
   const source=nav.querySelector('[data-tab="'+link.dataset.moreTab+'"]');
   link.href=source.href;link.setAttribute('aria-current',source===active?'page':'false');
  }
  if(!compact.matches&&dialog.open)dialog.close();
 }
 more.addEventListener('click',()=>{dialog.showModal();more.setAttribute('aria-expanded','true')});
 document.getElementById('closeMoreNavigation').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>{more.setAttribute('aria-expanded','false');if(compact.matches)more.focus({preventScroll:true})});
 dialog.addEventListener('click',event=>{
  const link=event.target.closest('[data-more-tab]');
  if(!link){if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close()}return}
  if(!followInPlace(event))return;event.preventDefault();dialog.close();setTab(link.dataset.moreTab);window.scrollTo({top:0,behavior:'instant'});
 });
 nav.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  const items=[...nav.querySelectorAll('[data-tab],#moreNavigation')].filter(b=>b.getClientRects().length),index=items.indexOf(event.target);
  if(index<0)return;event.preventDefault();
  items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowRight'?1:-1)+items.length)%items.length].focus();
 });
 new MutationObserver(sync).observe(nav,{subtree:true,attributes:true,attributeFilter:['aria-current','href']});
 compact.addEventListener('change',sync);document.addEventListener('site-language-change',sync);sync();
})();
