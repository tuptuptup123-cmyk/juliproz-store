'use strict';
const {createHmac,timingSafeEqual}=require('node:crypto'),{isIP}=require('node:net');
function signature(secret,time,ip,body){return createHmac('sha256',secret).update(time+'\n'+ip+'\n'+JSON.stringify(body)).digest('hex')}
function relayIP(headers,body,secret,now=Date.now()){
 const time=headers['x-jp-relay-time'],ip=headers['x-jp-relay-ip'],sig=headers['x-jp-relay-signature'];
 if(!/^[a-f0-9]{64}$/.test(secret||'')||!/^\d{13}$/.test(time||'')||Math.abs(now-Number(time))>60000||typeof ip!=='string'||!isIP(ip)||!/^[a-f0-9]{64}$/.test(sig||''))return null;
 return timingSafeEqual(Buffer.from(signature(secret,time,ip,body),'hex'),Buffer.from(sig,'hex'))?ip:null;
}
function createRelay(env=process.env,request=fetch,now=Date.now){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');const reply=(code,body)=>{res.statusCode=code;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body))};
  if(req.method!=='POST')return reply(405,{error:'method'});
  if(req.headers.origin!=='https://app.juliproz.com'||env.VERCEL_ENV!=='production')return reply(403,{error:'origin'});
  const {trustedIP,readBody}=require('./analytics.cjs'),ip=trustedIP(req.headers),secret=env.ANALYTICS_RELAY_SECRET;
  if(!ip||!/^[a-f0-9]{64}$/.test(secret||''))return reply(503,{error:'unavailable'});
  try{
   const body=await readBody(req),time=String(now());
   const response=await request('https://www.juliproz.com/api/analytics',{method:'POST',redirect:'error',signal:AbortSignal.timeout(7000),headers:{'Content-Type':'application/json',Origin:'https://app.juliproz.com','x-jp-relay-time':time,'x-jp-relay-ip':ip,'x-jp-relay-signature':signature(secret,time,ip,body)},body:JSON.stringify(body)});
   if(response.status===202)return reply(202,{accepted:true});
   if([400,403,413,429].includes(response.status))return reply(response.status,{accepted:false});
   return reply(503,{error:'unavailable'});
  }catch(e){return reply(e.status===413?413:e instanceof SyntaxError?400:503,{error:'unavailable'})}
 };
}
module.exports={signature,relayIP,createRelay};
