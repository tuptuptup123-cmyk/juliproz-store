(() => {
 'use strict';
 const config=window.STORE_CONFIG;if(!config)return;
 const uuid=()=>crypto.randomUUID(),valid=x=>/^[0-9a-f-]{36}$/i.test(x||'');
 function identity(storage,key){try{let id=storage.getItem(key);if(!valid(id)){id=uuid();storage.setItem(key,id)}return id}catch{return uuid()}}
 const visitor=identity(localStorage,'jpAnalyticsVisitor'),session=identity(sessionStorage,'jpAnalyticsSession');
 const recent=new Map();let sent=0;
 function track(event,product=null,page=null){
  if(document.visibilityState==='hidden'||sent>=2000)return;const now=Date.now(),key=`${event}:${product||''}:${page||''}`;
  if(now-(recent.get(key)||0)<(event==='product_view'?5000:350))return;recent.set(key,now);if(recent.size>200)recent.delete(recent.keys().next().value);sent++;
  fetch(`${config.url}/functions/v1/store-analytics`,{method:'POST',headers:{apikey:config.key,Authorization:`Bearer ${config.key}`,'Content-Type':'application/json'},body:JSON.stringify({event_id:uuid(),visitor_id:visitor,session_id:session,event,product_id:product==null?null:Number(product),page:page==='favorites'?'wishlist':page}),signal:AbortSignal.timeout(8000),keepalive:true}).catch(()=>{});
 }
 window.StoreAnalytics={track};track('visit');
 setInterval(()=>track('heartbeat'),60000);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')track('heartbeat')});
})();
