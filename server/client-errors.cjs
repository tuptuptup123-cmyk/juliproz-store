'use strict';
const {createHmac}=require('node:crypto'),config=require('../config.js'),{trustedIP,readBody}=require('./analytics.cjs');
const sites=new Map([['https://www.juliproz.com','website'],['https://juliproz.com','website'],['https://juliproz-store.vercel.app','website'],['https://app.juliproz.com','telegram'],['https://admin.juliproz.com','admin']]);
function createHandler(env=process.env,request=fetch,now=()=>new Date()){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Vary','Origin');
  const send=(code)=>{res.statusCode=code;res.end()};
  const origin=req.headers.origin,surface=sites.get(origin);if(!surface)return send(403);
  res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','content-type');
  if(req.method==='OPTIONS')return send(204);if(req.method!=='POST')return send(405);
  const secret=env.ANALYTICS_INGEST_SECRET,ip=trustedIP(req.headers);
  if(env.VERCEL_ENV!=='production'||typeof secret!=='string'||!/^[a-f0-9]{64}$/.test(secret)||!ip)return send(503);
  try{
   const b=await readBody(req);
   if(!b||Object.keys(b).some(k=>!['kind','asset','line','column','release'].includes(k))||!['TypeError','ReferenceError','SyntaxError','RangeError','Error','PromiseRejection','ResourceError'].includes(b.kind)||typeof b.asset!=='string'||!/^[a-zA-Z0-9_-]{1,80}\.(js|css)$/.test(b.asset)||![b.line,b.column].every(x=>Number.isInteger(x)&&x>=0&&x<=1000000)||typeof b.release!=='string'||!/^([a-f0-9]{7,40}|development)$/.test(b.release))return send(400);
   const hash=createHmac('sha256',secret).update('errors:'+now().toISOString().slice(0,10)+':'+ip).digest('hex');
   const r=await request(config.url+'/rest/v1/rpc/store_client_error_ingest',{method:'POST',headers:{apikey:config.key,'Content-Type':'application/json'},body:JSON.stringify({p_secret:secret,p_ip:hash,p_surface:surface,p_kind:b.kind,p_asset:b.asset,p_line:b.line,p_column:b.column,p_release:b.release}),redirect:'error',signal:AbortSignal.timeout(5000)});
   if(!r.ok)return send(503);return send(await r.json()===true?202:429);
  }catch{return send(503)}
 };
}
module.exports={createHandler};
