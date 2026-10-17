/* The browser sees a public session description; credentials stay behind HttpOnly cookies. */
(()=>{
 let csrf=null;
 async function send(path,options={},binary=false){
  const method=options.method||'GET',body=typeof options.body==='string'?JSON.parse(options.body):options.body;
  const response=await fetch('/api/admin',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-JP-Admin':'1',...(csrf?{'X-JP-CSRF':csrf}:{})},body:JSON.stringify({path,method,body,headers:options.headers}),signal:options.signal});
  if(binary&&response.ok&&response.headers.get('content-type')?.startsWith('image/'))return response;
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw Object.assign(Error(data?.message||'Сервер временно недоступен.'),{httpStatus:response.status,code:data?.code});
  if(data?.csrf)csrf=data.csrf;return data;
 }
 async function request(path,options={}){
  if(options.body instanceof Blob){
   if(!path.startsWith('/storage/v1/object/product-photos/'))throw Error('Недопустимая загрузка.');
   const signed=await send('/session/upload',{method:'POST',body:{path:path.slice('/storage/v1/object/product-photos/'.length)}});
   const target=new URL(signed.url);if(target.origin!==STORE_CONFIG.url||!target.pathname.startsWith('/storage/v1/object/upload/sign/product-photos/'))throw Error('Недопустимый адрес загрузки.');
   const r=await fetch(target.href,{method:'PUT',headers:{'Content-Type':options.body.type,apikey:STORE_CONFIG.key},body:options.body,signal:options.signal,credentials:'omit',redirect:'error'});
   const data=await r.json().catch(()=>null);if(!r.ok)throw Object.assign(Error(data?.message||'Не удалось загрузить фото.'),{httpStatus:r.status});return data;
  }
  return send(path,options);
 }
 async function photo(url){
  const result=await send('/session/photo',{method:'POST',body:{url}},true);if(result instanceof Response)return result;
  const target=new URL(result.photo_url);if(target.origin!==STORE_CONFIG.url||!target.pathname.startsWith('/storage/v1/object/sign/product-photos/'))throw Error('Недопустимый адрес фото.');
  return fetch(target.href,{credentials:'omit',cache:'no-store',redirect:'error'});
 }
 window.AdminTransport={request,photo,clear(){csrf=null}};
})();
