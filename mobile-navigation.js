(()=>{
 'use strict';
 const nav=document.querySelector('.bottom-nav');if(!nav||isTelegramStore())return;
 let active=null;
 function reveal(button){
  if(!button||nav.scrollWidth<=nav.clientWidth)return;
  const left=button.offsetLeft,right=left+button.offsetWidth;
  if(left<nav.scrollLeft+8)nav.scrollTo({left:Math.max(0,left-8),behavior:'instant'});
  else if(right>nav.scrollLeft+nav.clientWidth-8)nav.scrollTo({left:right-nav.clientWidth+8,behavior:'instant'});
 }
 function sync(){
  nav.setAttribute('aria-label',window.SiteLanguage?.language==='en'?'Main navigation; swipe for more sections':'Основные разделы; листайте вбок');
  const next=nav.querySelector('[data-tab][aria-current="page"]');
  if(next!==active){active=next;requestAnimationFrame(()=>reveal(active))}
 }
 nav.addEventListener('focusin',event=>reveal(event.target.closest('[data-tab]')));
 nav.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  const buttons=[...nav.querySelectorAll('[data-tab]')].filter(b=>!b.classList.contains('hidden')),index=buttons.indexOf(event.target);
  if(index<0)return;event.preventDefault();
  const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
  buttons[next].focus();
 });
 new MutationObserver(sync).observe(nav,{subtree:true,attributes:true,attributeFilter:['aria-current']});
 window.addEventListener('resize',()=>reveal(active));document.addEventListener('site-language-change',sync);sync();
})();
