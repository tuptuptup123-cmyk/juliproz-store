/* A deferred stylesheet must finish before the SSR homepage yields to the interactive store. */
(()=>{'use strict';const links=[...document.querySelectorAll('link[data-storefront-deferred]')];if(!links.length)return;
 const state=window.StorefrontStyles={ready:false,failed:false,promise:null};
 state.promise=Promise.all(links.map(link=>new Promise((resolve,reject)=>{
  let settled=false;const finish=()=>{if(settled)return;settled=true;link.media='all';resolve()};
  link.addEventListener('load',finish,{once:true});link.addEventListener('error',()=>{if(settled)return;settled=true;reject(Error('Stylesheet unavailable: '+link.getAttribute('href')))},{once:true});
  // Changing media during an in-flight low-priority fetch can cancel/restart it.
  // Activate only a completed sheet; the inline server styles cover the wait.
  if(link.sheet)finish();
 }))).then(()=>new Promise(resolve=>requestAnimationFrame(()=>{state.ready=true;resolve()})));
 // Keep the styled server page and its ordinary links usable if an asset fails.
 state.promise.catch(()=>{state.failed=true});
})();
