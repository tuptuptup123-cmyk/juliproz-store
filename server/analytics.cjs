'use strict';
const {createHmac}=require('node:crypto');
const {isIP}=require('node:net');
const config=require('../config.js');
const ORIGIN='https://qhgzzhgxwpcctafpzjid.supabase.co';
const origins=new Set(['https://juliproz-store.vercel.app','https://juliproz.com','https://www.juliproz.com','https://app.juliproz.com']);
const events=new Set(['visit','heartbeat','page_view','product_view','wishlist_add','wishlist_remove','cart_add','cart_remove','checkout_open','manager_open','manager_product','manager_search_product','manager_general','manager_sell','manager_authentication','manager_atelier']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function trustedIP(headers){
 // Vercel overwrites this header at ingress. Never fall back to client-supplied
 // forwarding chains, cf-connecting-ip or request bodies. See docs/headers/request-headers.
 const value=headers['x-vercel-forwarded-for'];
 if(typeof value!=='string'||value.length>45||value.includes('%')||!isIP(value))return null;
 return isIP(value)===6?new URL(`http://[${value}]/`).hostname.slice(1,-1):value;
}
async function readBody(req){
 if(Number(req.headers['content-length']||0)>2048)throw Object.assign(Error(),{status:413});
 if(req.body!==undefined){const value=typeof req.body==='string'||Buffer.isBuffer(req.body)?req.body:JSON.stringify(req.body);if(Buffer.byteLength(value)>2048)throw Object.assign(Error(),{status:413});return JSON.parse(String(value))}
 const chunks=[];let bytes=0;
 for await(const chunk of req){bytes+=Buffer.byteLength(chunk);if(bytes>2048)throw Object.assign(Error(),{status:413});chunks.push(Buffer.from(chunk))}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function validEvent(b){return b&&typeof b==='object'&&!Array.isArray(b)&&uuid.test(b.event_id)&&uuid.test(b.visitor_id)&&uuid.test(b.session_id)&&events.has(b.event)&&(b.product_id==null||Number.isSafeInteger(b.product_id)&&b.product_id>0)&&(b.page==null||['catalog','wishlist','cart'].includes(b.page))}
function createHandler(env=process.env,request=fetch,now=()=>new Date()){
 return async(req,res)=>{
  const origin=req.headers.origin;
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.setHeader('Vary','Origin');
  const reply=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data))};
  if(!origins.has(origin))return reply(403,{error:'origin'});
  res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Access-Control-Allow-Headers','authorization,apikey,content-type');res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  if(req.method==='OPTIONS'){res.statusCode=204;return res.end()}
  if(req.method!=='POST'){res.setHeader('Allow','POST, OPTIONS');return reply(405,{error:'method'})}
  if(env.VERCEL_ENV!=='production')return reply(403,{error:'environment'});
  const secret=env.ANALYTICS_INGEST_SECRET,ip=trustedIP(req.headers);
  if(typeof secret!=='string'||!/^[a-f0-9]{64}$/.test(secret)||!ip)return reply(503,{error:'unavailable'});
  try{
   const b=await readBody(req);if(!validEvent(b))return reply(400,{error:'event'});
   const fingerprint=createHmac('sha256',secret).update(`juliproz:analytics-ip:v1:${now().toISOString().slice(0,10)}:${ip}`).digest('hex');
   const response=await request(`${ORIGIN}/rest/v1/rpc/store_analytics_gateway_ingest`,{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),
    headers:{apikey:config.key,'Content-Type':'application/json'},
    body:JSON.stringify({p_secret:secret,p_event_id:b.event_id,p_visitor:b.visitor_id,p_session:b.session_id,p_event:b.event,p_product:b.product_id??null,p_page:b.page??null,p_fingerprint:fingerprint})
   });
   if(!response.ok)return reply(503,{error:'unavailable'});
   let accepted;try{accepted=await response.json()}catch{return reply(503,{error:'unavailable'})}if(typeof accepted!=='boolean')return reply(503,{error:'unavailable'});
   return reply(accepted?202:429,{accepted});
  }catch(error){return reply(error.status===413?413:error instanceof SyntaxError?400:503,{error:error.status===413?'size':error instanceof SyntaxError?'invalid':'unavailable'})}
 };
}
module.exports={createHandler,trustedIP};
