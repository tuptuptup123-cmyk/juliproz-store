(() => {
 'use strict';
 const config=window.STORE_CONFIG;if(!config)return;
 let consent=null,visitor=null,session=null,sent=0;const recent=new Map();
 const uuid=()=>crypto.randomUUID(),valid=x=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x||'');
 function identity(storage,key){try{let id=storage.getItem(key);if(!valid(id)){id=uuid();storage.setItem(key,id)}return id}catch{return uuid()}}
 function forget(){try{localStorage.removeItem('jpAnalyticsVisitor');sessionStorage.removeItem('jpAnalyticsSession')}catch{}visitor=null;session=null;recent.clear();sent=0}
 function showChoices(){document.getElementById('analyticsConsent')?.classList.remove('hidden');document.getElementById('analyticsAccept')?.focus()}
 function setConsent(value){
  consent=value===true;try{localStorage.setItem('jpAnalyticsConsent',consent?'accepted':'declined')}catch{}
  document.getElementById('analyticsConsent')?.classList.add('hidden');
  if(!consent){forget();return}
  visitor=identity(localStorage,'jpAnalyticsVisitor');session=identity(sessionStorage,'jpAnalyticsSession');track('visit');
 }
 function track(event,product=null,page=null){
  if(consent!==true||document.visibilityState==='hidden'||sent>=2000)return;const now=Date.now(),key=`${event}:${product||''}:${page||''}`;
  if(now-(recent.get(key)||0)<(event==='product_view'?5000:350))return;recent.set(key,now);if(recent.size>200)recent.delete(recent.keys().next().value);sent++;
  fetch(`${config.url}/functions/v1/store-analytics`,{method:'POST',headers:{apikey:config.key,Authorization:`Bearer ${config.key}`,'Content-Type':'application/json'},body:JSON.stringify({event_id:uuid(),visitor_id:visitor,session_id:session,event,product_id:product==null?null:Number(product),page:page==='favorites'?'wishlist':page}),signal:AbortSignal.timeout(8000),keepalive:true}).catch(()=>{});
 }
 window.StoreAnalytics={track,setConsent,showChoices};
 document.getElementById('analyticsAccept')?.addEventListener('click',()=>setConsent(true));
 document.getElementById('analyticsDecline')?.addEventListener('click',()=>setConsent(false));
 document.getElementById('analyticsPreferences')?.addEventListener('click',showChoices);
 try{const saved=localStorage.getItem('jpAnalyticsConsent');if(saved==='accepted')setConsent(true);else{forget();if(saved==='declined')consent=false;else showChoices()}}catch{forget();showChoices()}
 window.addEventListener?.('storage',e=>{if(e.key==='jpAnalyticsConsent'){if(e.newValue==='accepted')setConsent(true);else{consent=false;forget();if(e.newValue===null)showChoices()}}});
 setInterval(()=>track('heartbeat'),60000);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')track('heartbeat')});
})();
