// Private photos use revocable in-memory blob URLs; no persisted signed links.
(()=>{
 const cache=new Map(),pending=new Map();let generation=0,refreshJob=null;
 async function read(value){
  if(!safeProductImage(value)||!session||!checkAdminSession())throw Error('Фото недоступно.');
  if(session.expires_at<Date.now()/1000+60){if(!refreshJob)refreshJob=request('/rest/v1/rpc/touch_store_admin_session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).finally(()=>refreshJob=null);await refreshJob}
  const epoch=sessionEpoch,response=await window.AdminTransport.photo(value);
  if(epoch!==sessionEpoch||!response.ok)throw Error('Не удалось загрузить фото.');
  const blob=await response.blob();if(blob.size>6*1024*1024||!['image/webp','image/png','image/jpeg'].includes(blob.type))throw Error('Недопустимый формат фото.');return blob;
 }
 async function resolve(value){
  if(cache.has(value))return cache.get(value);if(pending.has(value))return pending.get(value);
  const gen=generation,job=read(value).then(blob=>{if(gen!==generation)throw Error('Сессия завершена.');const src=URL.createObjectURL(blob);cache.set(value,src);return src}).finally(()=>{if(pending.get(value)===job)pending.delete(value)});
  pending.set(value,job);return job;
 }
 function load(img){
  if(img.dataset.photoLoading==='true')return;
  const value=img.dataset.privatePhoto;img.dataset.photoLoading='true';const gen=generation;
  resolve(value).then(src=>{if(gen===generation&&img.isConnected&&img.dataset.privatePhoto===value)img.src=src}).catch(()=>{if(img.isConnected)img.alt='Не удалось загрузить фото — обновите список'});
 }
 const visible=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){visible.unobserve(e.target);load(e.target)}},{rootMargin:'200px'}):null;
 const observer=new MutationObserver(()=>{
  for(const img of document.querySelectorAll('img[data-private-photo]:not([data-photo-observed])')){
   img.dataset.photoObserved='true';if(visible&&img.loading==='lazy')visible.observe(img);else load(img);
  }
 });observer.observe(document.body,{childList:true,subtree:true});
 function attrs(value){return safeProductImage(value)?'data-private-photo="'+esc(value)+'"'+(cache.has(value)?' src="'+esc(cache.get(value))+'"':''):'src="'+esc(value)+'"'}
 function clear(){generation++;visible?.disconnect();for(const src of cache.values())URL.revokeObjectURL(src);cache.clear();pending.clear();document.querySelectorAll('[data-private-photo]').forEach(img=>{img.removeAttribute('src');delete img.dataset.photoLoading;delete img.dataset.photoObserved})}
 window.AdminImages={attrs,read,clear};
})();
