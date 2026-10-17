'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createHandler,COOKIE}=require('../server/admin-bff.cjs');
const secret='a'.repeat(64),owner='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222';
function fixture(options={}){
 let time=Date.now(),rotations=0,revoked=false,failUser=false,touchFailure=0,touchGate=null,aal=options.browser?'aal1':'aal2';const rows=new Map(),calls=[];
 const user={id:owner,email:'owner@example.invalid',factors:[{id:'factor',status:'verified',factor_type:'totp'}]};
 const token=(aal='aal2')=>'signed.'+Buffer.from(JSON.stringify({sub:owner,session_id:sid,exp:Math.floor(time/1000)+3600,aal,amr:[{method:'totp',timestamp:Math.floor(time/1000)}]})).toString('base64url')+'.signature';
 const auth=()=>({access_token:token(aal),refresh_token:'private-refresh-'+rotations,user});
 const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 async function fetch(url,o={}){
  calls.push({url,options:o});const path=new URL(url).pathname,b=o.body&&JSON.parse(o.body);
  if(path.endsWith('/store_admin_bff_session')){
   assert.equal(b.p_secret,secret);const row=rows.get(b.p_id);
   if(b.p_action==='rate')return response(true);
   if(b.p_action==='create'){const next={payload:b.p_payload,auth_session_id:sid,user_id:owner,expires_at:new Date(time+30*86400000).toISOString(),server_now:new Date(time).toISOString(),lease:null};rows.set(b.p_id,next);return response(next)}
   if(b.p_action==='delete'){rows.delete(b.p_id);return response(true)}
   if(!row||revoked||Date.parse(row.expires_at)<=time)return response(null);
   if(b.p_action==='lock'){if(row.lease)return response({busy:true});row.lease=randomUUID()}
   if(b.p_action==='commit'){assert.equal(b.p_lease,row.lease);row.payload=b.p_payload;row.lease=null}
   if(b.p_action==='unlock')row.lease=null;
   return response({...row,server_now:new Date(time).toISOString()});
  }
  if(path==='/auth/v1/token'){if(new URL(url).searchParams.get('grant_type')==='refresh_token')rotations++;else {aal=options.browser?'aal1':'aal2';revoked=false}return response(auth())}
  if(path==='/auth/v1/user'){if(failUser)return response({},503);return response(user)}
  if(path.endsWith('/challenge'))return response({id:'challenge'});
  if(path.endsWith('/verify')){aal='aal2';return response(auth())}
  if(path.startsWith('/storage/v1/object/sign/product-photos/'))return response({signedURL:path.slice('/storage/v1'.length)+'?token=short-capability'});
  if(path.startsWith('/storage/v1/object/upload/sign/product-photos/'))return response({url:path.slice('/storage/v1'.length)+'?token=upload-capability'});
  if(path==='/auth/v1/logout')return response({});
  if(path==='/rest/v1/store_admins')return response([{user_id:owner}]);
  if(path.endsWith('/touch_store_admin_session')){if(touchGate)await touchGate;if(touchFailure)return response({message:'Synthetic interruption'},touchFailure);const row=[...rows.values()][0];return response({server_now:new Date(time).toISOString(),expires_at:row?.expires_at,idle_expires_at:row?.expires_at})}
  if(path.endsWith('/store_admin_security_status'))return response({paused:false,pending:false,access_role:'owner'});
  if(path.endsWith('/store_product_finance'))return response({cost:null});
  if(path.endsWith('/store_admin_operational_health'))return response({bot:{},errors:[]});
  if(path.endsWith('/store_analytics_summary'))return response({counts:{},daily:[]});
  if(path.includes('/rest/v1/'))return response([]);
  return response({},404);
 }
 const handler=createHandler({ADMIN_SESSION_SECRET:secret,VERCEL_ENV:'production',NODE_ENV:options.browser?'test':undefined},fetch,()=>time);
 async function invoke(path,{cookie,csrf,origin='https://admin.juliproz.com',header='1',method='GET',body,headers={}}={}){
  const r={headers:{}};await handler({method:'POST',headers:{origin,'x-jp-admin':header,'content-type':'application/json','x-vercel-forwarded-for':'192.0.2.1',...(cookie?{cookie}:{}) ,...(csrf?{'x-jp-csrf':csrf}:{}),...headers},body:{path,method,body}}, {setHeader(k,v){r.headers[k]=v},set statusCode(n){r.status=n},end(v){r.body=JSON.parse(v)}});return r;
 }
 async function login(){const r=await invoke('/auth/v1/token?grant_type=password',{method:'POST',body:{email:user.email,password:'a-strong-password'}});assert.equal(r.status,200);return {r,cookie:r.headers['Set-Cookie'].split(';')[0],csrf:r.body.csrf}}
 return {handler,user,invoke,login,calls,rows,touchFailure(value){touchFailure=value},touchGate(value){touchGate=value},get rotations(){return rotations},advance(ms){time+=ms},revoke(){revoked=true},outage(value){failUser=value},auth};
}

module.exports={fixture,COOKIE};
