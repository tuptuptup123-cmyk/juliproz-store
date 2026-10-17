(()=>{
 const nav=document.querySelector('.bottom-nav'),trigger=document.getElementById('moreNavigation'),dialog=document.getElementById('moreNavigationDialog');if(!nav||!trigger||!dialog)return;
 const extra=['home','services','about'];
 for(const tab of extra)nav.querySelector('[data-tab="'+tab+'"]')?.classList.add('mobile-secondary');
 function sync(){
  const mobile=!isTelegramStore()&&matchMedia('(max-width: 680px)').matches,active=mobile&&extra.includes(state.tab),value=active?'page':'false';
  if(trigger.getAttribute('aria-current')!==value){trigger.classList.toggle('active',active);trigger.setAttribute('aria-current',value)}
  for(const tab of extra){const button=nav.querySelector('[data-tab="'+tab+'"]'),current=!mobile&&state.tab===tab?'page':'false';if(button){button.classList.toggle('active',current==='page');if(button.getAttribute('aria-current')!==current)button.setAttribute('aria-current',current)}}
 }

 trigger.onclick=()=>{dialog.showModal();trigger.setAttribute('aria-expanded','true')};
 dialog.querySelector('[data-close-more]').onclick=()=>dialog.close();
 dialog.addEventListener('click',e=>{if(e.target===dialog){dialog.close();return}const tab=e.target.closest('[data-more-tab]')?.dataset.moreTab;if(tab){dialog.close();setTab(tab);sync()}});
 dialog.addEventListener('close',()=>{trigger.setAttribute('aria-expanded','false');trigger.focus()});
 new MutationObserver(sync).observe(nav,{subtree:true,attributes:true,attributeFilter:['aria-current']});
 const query=matchMedia('(max-width: 680px)');query.addEventListener('change',e=>{if(!e.matches&&dialog.open)dialog.close();sync()});
 sync();
})();
