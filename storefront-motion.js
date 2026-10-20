/* Progressive motion: no hidden content, delayed navigation or click interception. */
(()=>{
 const preference=matchMedia('(prefers-reduced-motion: reduce)');
 const entered=new WeakSet(),running=new WeakMap();
 const revealSelector='.discovery-section,.sell-method,.service-card,.information-card,.buyer-service-card';
 let frame=0;
 const animate=(node,offset=10)=>{
  if(preference.matches||!node?.getClientRects().length||!node.animate)return;
  running.get(node)?.cancel();
  const animation=node.animate([{opacity:.35,transform:`translateY(${offset}px)`},{opacity:1,transform:'translateY(0)'}],{duration:320,easing:'cubic-bezier(.22,1,.36,1)'});
  running.set(node,animation);
 };
 const observer='IntersectionObserver' in window?new IntersectionObserver(entries=>{
  for(const entry of entries){if(!entry.isIntersecting||!entry.target.getClientRects().length)continue;observer.unobserve(entry.target);if(!entered.has(entry.target)){entered.add(entry.target);animate(entry.target,12);}}
 },{threshold:.08}):null;
 const scan=root=>{if(!observer||preference.matches||root.nodeType!==1)return;if(root.matches(revealSelector))observer.observe(root);root.querySelectorAll(revealSelector).forEach(node=>{if(!entered.has(node))observer.observe(node)});};
 let lastTab=document.querySelector('.bottom-nav [aria-current="page"]')?.dataset.tab;
 const update=()=>{
  frame=0;
  const tab=document.querySelector('.bottom-nav [aria-current="page"]')?.dataset.tab;
  if(tab&&tab!==lastTab){lastTab=tab;document.querySelectorAll('#webHomePage,#webAboutPage,#webOutletPage,#cartPage,#sellPage,#servicesPage,#seoCatalogIntro,#grid').forEach(node=>animate(node));}
 };
 const changes=new MutationObserver(records=>{
  for(const record of records)if(record.type==='childList')record.addedNodes.forEach(scan);
  if(!frame)frame=requestAnimationFrame(update);
 });
 changes.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-current']});
 scan(document.body);
 preference.addEventListener('change',()=>{if(preference.matches){observer?.disconnect();document.getAnimations().filter(a=>a.effect?.target&&running.get(a.effect.target)===a).forEach(a=>a.cancel());}else scan(document.body);});
})();
