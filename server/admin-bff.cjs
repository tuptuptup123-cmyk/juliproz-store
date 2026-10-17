'use strict';
const {createHash,createHmac,randomBytes,timingSafeEqual}=require('node:crypto');
const config=require('../config.js'),box=require('./secret-box.cjs');
const COOKIE='__Host-jp-admin',PURPOSE='juliproz:admin-session:v1',MAX=30*86400000;
const fail=(status,message,code)=>Object.assign(Error(message),{status,code});
function claims(token){try{return JSON.parse(Buffer.from(token.split('.')[1],'base64url'))}catch{throw fail(401,'Не удалось проверить вход.')}}
function cookie(req){const entries=String(req.headers.cookie||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(COOKIE+'='));return entries.length===1&&/^[a-f0-9]{64}$/.test(entries[0].slice(COOKIE.length+1))?entries[0].slice(COOKIE.length+1):null}
const digest=v=>createHash('sha256').update(v).digest('hex');
function allowedPath(path,method){
 if(typeof path!=='string'||path.length>6000||/[\\\r\n#]/.test(path)||!path.startsWith('/')||path.startsWith('//'))return false;
 const u=new URL(path,config.url);if(u.origin!==config.url)return false;
 const p=u.pathname;
 if(p==='/auth/v1/user')return ['GET','PUT'].includes(method);
 if(p==='/auth/v1/logout')return method==='POST'&&['local','global'].includes(u.searchParams.get('scope')||'local');
 if(p==='/auth/v1/factors')return method==='POST';
 if(/^\/auth\/v1\/factors\/[a-zA-Z0-9_-]+(?:\/(?:challenge|verify))?$/.test(p))return p.endsWith('/challenge')||p.endsWith('/verify')?method==='POST':method==='DELETE';
 if(/^\/rest\/v1\/(products|product_admin_notes|store_admins)$/.test(p))return ['GET','POST','PATCH','DELETE'].includes(method);
 if(/^\/rest\/v1\/rpc\/(store_[a-z_]+|touch_store_admin_session|enforce_store_mfa)$/.test(p))return method==='POST'&&!/(?:bff|bot_(?:enqueue|claim|finish)|ingest)/.test(p);
 if(p==='/functions/v1/invite-store-admin')return method==='POST';
 if(p==='/storage/v1/object/list/product-photos')return method==='POST';
 return false;
}
function createHandler(env=process.env,request=fetch,now=()=>Date.now()){
 const secret=env.ADMIN_SESSION_SECRET;
 async function rpc(action,id,extra={}){
  const r=await request(config.url+'/rest/v1/rpc/store_admin_bff_session',{method:'POST',headers:{apikey:config.key,'Content-Type':'application/json'},body:JSON.stringify({p_secret:secret,p_action:action,p_id:id,...extra}),redirect:'error',signal:AbortSignal.timeout(6000)});
  if(!r.ok)throw fail(r.status===401?401:503,'Не удалось проверить сессию. Повторите попытку.');return r.json();
 }
 async function upstream(path,method='GET',body,token,headers={}){
  const r=await request(config.url+path,{method,headers:{apikey:config.key,...(token?{Authorization:'Bearer '+token}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(path.includes('invite-store-admin')?45000:15000)});
  const data=r.status===204?null:await r.json().catch(()=>null);
  if(!r.ok)throw fail(r.status,data?.message||data?.msg||data?.error_description||'Не удалось выполнить запрос.',data?.code||data?.error_code);
  return data;
 }
 const csrf=id=>createHmac('sha256',secret).update('csrf:'+id).digest('hex');
 function setCookie(res,id,deadline,persist=false){res.setHeader('Set-Cookie',`${COOKIE}=${id}; Path=/; HttpOnly; Secure; SameSite=Strict${persist?'; Max-Age='+Math.max(0,Math.floor((deadline-now())/1000)):''}`)}
 function clearCookie(res){res.setHeader('Set-Cookie',`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`)}
 function unpack(row){if(!row?.payload)throw fail(401,'Сессия завершена. Войди заново.');return box.open(row.payload,secret,PURPOSE)}
 function publicSession(data,row,id){const c=claims(data.access_token);return {cookie_session:true,user:data.user,expires_at:c.exp,session_id:c.session_id,aal:c.aal||'aal1',amr:c.amr||[],setup_flow:data.setup_flow||null,csrf:csrf(id),limits:{absolute:row.expires_at,idle:row.expires_at},server_now:row.server_now}}
 async function create(data,res,oldId,flow=null){
  if(!data?.access_token||!data.refresh_token)throw fail(401,'Не удалось подтвердить вход.');
  const user=await upstream('/auth/v1/user','GET',undefined,data.access_token),c=claims(data.access_token);
  if(!user?.id||user.id!==c.sub||!c.session_id)throw fail(401,'Не удалось проверить аккаунт.');
  data={access_token:data.access_token,refresh_token:data.refresh_token,user,setup_flow:['invite','recovery'].includes(flow)?flow:null};
  const id=randomBytes(32).toString('hex'),row=await rpc('create',digest(id),{p_payload:box.seal(data,secret,PURPOSE),p_auth_session:c.session_id,p_user:user.id});
  // Replace only after the new record is durable. No plaintext tokens leave the server.
  if(oldId)await rpc('delete',digest(oldId));setCookie(res,id,Date.parse(row.expires_at));return publicSession(data,row,id);
 }
 async function read(id){return rpc('read',digest(id))}
 async function lock(id){
  for(let i=0;i<16;i++){const row=await rpc('lock',digest(id));if(!row?.busy){unpack(row);return row}await new Promise(r=>setTimeout(r,150+i*25))}
  throw fail(409,'Вход обновляется в другой вкладке. Повторите действие.','SESSION_BUSY');
 }
 async function fresh(id){
  let row=await read(id),data=unpack(row);if(claims(data.access_token).exp>now()/1000+60)return {row,data};
  row=await lock(id);data=unpack(row);
  try{
   if(claims(data.access_token).exp<=now()/1000+60){
    const updated=await upstream('/auth/v1/token?grant_type=refresh_token','POST',{refresh_token:data.refresh_token});
    if(!updated?.access_token||claims(updated.access_token).session_id!==row.auth_session_id)throw fail(401,'Сессия завершена.');
    data={...data,...updated};
   }
   row=await rpc('commit',digest(id),{p_payload:box.seal(data,secret,PURPOSE),p_lease:row.lease});return {row,data};
  }catch(e){if([400,401,403].includes(e.status))await rpc('delete',digest(id));else await rpc('unlock',digest(id),{p_lease:row.lease}).catch(()=>{});throw e}
 }
 async function limit(req){
  const ip=require('./analytics.cjs').trustedIP(req.headers);
  if(!ip&&env.VERCEL_ENV==='production')throw fail(503,'Вход временно недоступен.');
  const fingerprint=createHmac('sha256',secret).update('login:'+String(ip||'development')).digest('hex');
  if(await rpc('rate',fingerprint)!==true)throw fail(429,'Слишком много попыток. Подождите минуту.');
 }
 return async(req,res)=>{
  for(const [k,v] of Object.entries({'Cache-Control':'private, no-store','CDN-Cache-Control':'no-store','Vercel-CDN-Cache-Control':'no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff','Vary':'Cookie'}))res.setHeader(k,v);
  const send=(status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data))};
  let id=cookie(req);
  try{
   if(req.method!=='POST')throw fail(405,'Method not allowed');
   const origins=new Set(['https://admin.juliproz.com']);
   if(env.VERCEL_ENV==='preview'&&env.VERCEL_URL)origins.add('https://'+env.VERCEL_URL);
   if(env.NODE_ENV==='test')origins.add('http://localhost:8796');
   if(!origins.has(req.headers.origin)||req.headers['x-jp-admin']!=='1'||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw fail(403,'Недопустимый источник запроса.','CSRF');
   if(typeof secret!=='string'||!/^[a-f0-9]{64}$/.test(secret))throw fail(503,'Вход временно недоступен.');
   const serialized=typeof req.body==='string'?req.body:JSON.stringify(req.body);
   if(!serialized||Buffer.byteLength(serialized)>128*1024)throw fail(413,'Слишком большой запрос.');
   const envelope=JSON.parse(serialized);if(!envelope||typeof envelope!=='object'||Array.isArray(envelope))throw fail(400,'Недопустимый запрос.');
   const path=envelope.path,method=envelope.method||'GET',body=envelope.body;
   if(!envelope||typeof path!=='string'||!['GET','POST','PUT','PATCH','DELETE'].includes(method))throw fail(400,'Недопустимый запрос.');
   const bootstrap=['/session','/session/import','/session/link-preview','/auth/v1/token?grant_type=password','/auth/v1/verify'].includes(path)||path.startsWith('/auth/v1/recover?');
   if(id&&!bootstrap){const value=req.headers['x-jp-csrf'],expected=csrf(id);if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value)||!timingSafeEqual(Buffer.from(value),Buffer.from(expected)))throw fail(403,'Сессия изменилась в другой вкладке. Обновите страницу.','SESSION_CHANGED')}
   if(path==='/session/link-preview'){
    await limit(req);if(typeof body?.access_token!=='string'||body.access_token.length>8192)throw fail(400,'Некорректная ссылка.');
    const user=await upstream('/auth/v1/user','GET',undefined,body.access_token);
    if(id){const previous=unpack(await read(id));if(previous.user.id!==user.id)throw fail(409,'Ссылка относится к другому аккаунту. Сначала выйдите из текущего аккаунта.')}
    return send(200,{id:user.id,email:user.email});
   }
   if(path==='/session/import'){
    await limit(req);if(typeof body?.access_token!=='string'||typeof body?.refresh_token!=='string'||body.access_token.length>8192||body.refresh_token.length>1024)throw fail(400,'Некорректная ссылка.');
    const data=await upstream('/auth/v1/token?grant_type=refresh_token','POST',{refresh_token:body.refresh_token});
    const user=await upstream('/auth/v1/user','GET',undefined,data.access_token);
    if(id){const previous=unpack(await read(id));if(previous.user.id!==user.id)throw fail(409,'Ссылка относится к другому аккаунту. Сначала выйдите из текущего аккаунта.')}
    if(claims(data.access_token).sub!==user.id||claims(data.access_token).session_id!==claims(body.access_token).session_id)throw fail(401,'Не удалось проверить ссылку.');
    return send(200,await create(data,res,id,body?.type));
   }
   if(path==='/auth/v1/token?grant_type=password'||path==='/auth/v1/verify'){
    await limit(req);if(method!=='POST')throw fail(405,'Method not allowed');
    if(path.endsWith('/verify')&&!['invite','recovery'].includes(body?.type))throw fail(400,'Неподдерживаемая ссылка.');
    const data=await upstream(path,'POST',body);return send(200,await create(data,res,id,body?.type));
   }
   if(path.startsWith('/auth/v1/recover?')){
    await limit(req);if(method!=='POST'||typeof body?.email!=='string'||body.email.length>320)throw fail(400,'Проверьте email.');
    return send(200,await upstream('/auth/v1/recover?redirect_to='+encodeURIComponent('https://admin.juliproz.com/admin.html'),'POST',{email:body.email}));
   }
   if(!id)throw fail(401,'Сессия завершена. Войди заново.');
   if(path.startsWith('/auth/v1/logout')){
    if(!allowedPath(path,method))throw fail(400,'Недопустимый запрос.');
    const row=await read(id);await rpc('delete',digest(id));clearCookie(res);
    if(row)await upstream(path,'POST',undefined,unpack(row).access_token).catch(()=>{});return send(200,{signed_out:true});
   }
   let current=await fresh(id);
   if(path==='/session')return send(200,publicSession(current.data,current.row,id));
   if(path==='/session/complete'){
    if(current.data.setup_flow)throw fail(403,'Сначала завершите настройку пароля.');
    await upstream('/rest/v1/rpc/touch_store_admin_session','POST',{},current.data.access_token);
    const admins=await upstream('/rest/v1/store_admins?select=user_id&user_id=eq.'+encodeURIComponent(current.data.user.id),'GET',undefined,current.data.access_token);
    if(!Array.isArray(admins)||admins.length!==1)throw fail(403,'Доступ ещё не подтверждён владельцем.');
    setCookie(res,id,Date.parse(current.row.expires_at),true);return send(200,publicSession(current.data,current.row,id));
   }
   if(path==='/session/photo'){
    const target=new URL(body?.url||'',config.url);let imageURL;
    if(target.username||target.password||target.search||target.hash)throw fail(400,'Недопустимое фото.');
    const storagePrefix=['/storage/v1/object/public/product-photos/','/functions/v1/product-photo/'].find(prefix=>target.pathname.startsWith(prefix));
    if(target.origin===config.url&&storagePrefix){
     const name=target.pathname.slice(storagePrefix.length);
     if(!name||/%2f|%5c|%2e/i.test(name))throw fail(400,'Недопустимое фото.');
     // Storage validates SELECT/RLS with this admin's JWT. A 60-second capability
     // avoids copying a 6 MB image through Vercel's 4.5 MB function response limit.
     const signed=await upstream('/storage/v1/object/sign/product-photos/'+name,'POST',{expiresIn:60},current.data.access_token);
     return send(200,{photo_url:config.url+'/storage/v1'+signed.signedURL});
    }
    if(target.origin===config.url&&target.pathname.startsWith('/storage/v1/object/public/product-photos/'))imageURL=config.url+target.pathname.replace('/object/public/','/object/authenticated/');
    else if(target.origin===config.url&&target.pathname.startsWith('/functions/v1/product-photo/'))imageURL=target.href;
    else if(target.origin==='https://juliproz-store.vercel.app'&&target.pathname.startsWith('/images/'))imageURL=target.href;
    else throw fail(400,'Недопустимое фото.');
    if(target.username||target.password||target.search||target.hash)throw fail(400,'Недопустимое фото.');
    const r=await request(imageURL,{headers:{Authorization:'Bearer '+current.data.access_token,...(target.origin===config.url?{apikey:config.key}:{})},redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw fail(r.status,'Не удалось загрузить фото.');
    const type=r.headers.get('content-type')?.split(';')[0];if(!['image/png','image/jpeg','image/webp'].includes(type)||Number(r.headers.get('content-length'))>6*1024*1024)throw fail(400,'Недопустимое фото.');
    const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>6*1024*1024)throw fail(413,'Фото слишком большое.');res.statusCode=200;res.setHeader('Content-Type',type);return res.end(bytes);
   }
   if(path==='/session/upload'){
    const name=body?.path;if(typeof name!=='string'||!new RegExp('^'+current.data.user.id+'/[a-zA-Z0-9_-]+\\.(webp|png|jpg|jpeg)$').test(name))throw fail(400,'Недопустимое имя фото.');
    // Storage performs the existing INSERT/RLS/MFA checks. This capability cannot read data.
    const result=await upstream('/storage/v1/object/upload/sign/product-photos/'+name,'POST',{},current.data.access_token);
    return send(200,{url:config.url+'/storage/v1'+result.url});
   }
   if(!allowedPath(path,method))throw fail(400,'Недопустимый запрос.');
   if(path==='/auth/v1/user'&&method==='PUT'&&body?.password!==undefined&&(typeof body.password!=='string'||body.password.length<12))throw fail(400,'Пароль должен содержать минимум 12 символов.');
   const forwarded={};for(const name of ['Prefer','If-Match','Accept'])if(typeof envelope.headers?.[name]==='string'&&envelope.headers[name].length<300)forwarded[name]=envelope.headers[name];
   if(/^\/auth\/v1\/factors\/[^/]+\/verify$/.test(path)){
    const row=await lock(id),data=unpack(row);
    try{const updated=await upstream(path,method,body,data.access_token);if(!updated?.access_token||claims(updated.access_token).session_id!==row.auth_session_id)throw fail(401,'Не удалось подтвердить второй фактор.');
     const next={...data,...updated},saved=await rpc('commit',digest(id),{p_payload:box.seal(next,secret,PURPOSE),p_lease:row.lease});return send(200,publicSession(next,saved,id));
    }catch(e){await rpc('unlock',digest(id),{p_lease:row.lease}).catch(()=>{});throw e}
   }
   if(path==='/auth/v1/user'&&method==='PUT'&&body?.password!==undefined){
    const row=await lock(id),data=unpack(row);
    try{const before=await upstream('/auth/v1/user','GET',undefined,data.access_token);
     if(before?.factors?.some(f=>f.status==='verified')&&claims(data.access_token).aal!=='aal2')throw fail(403,'Сначала подтвердите код аутентификатора.','MFA_REQUIRED');
     const user=await upstream(path,method,body,data.access_token,forwarded);
     await rpc('commit',digest(id),{p_payload:box.seal({...data,user,setup_flow:null},secret,PURPOSE),p_lease:row.lease});return send(200,user);
    }catch(e){await rpc('unlock',digest(id),{p_lease:row.lease}).catch(()=>{});throw e}
   }
   return send(200,await upstream(path,method,body,current.data.access_token,forwarded));
  }catch(e){if(e.status===401&&id)clearCookie(res);return send(e.status||503,{message:e.status?e.message:'Сервер временно недоступен. Повторите попытку.',code:e.code||null})}
 };
}
module.exports={createHandler,allowedPath,COOKIE};
