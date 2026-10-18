'use strict';
const {randomInt}=require('node:crypto');
const {validInitData}=require('./telegram-init-data.cjs');
const {readBody}=require('./analytics.cjs');
const {readToken}=require('./telegram.cjs');
const {createDistributedGuard}=require('./telegram-limit.cjs');
const config=require('../config.js');
const sizes=require('../product-sizes.js');
const origins=new Set(['https://www.juliproz.com','https://juliproz.com','https://juliproz-store.vercel.app','https://app.juliproz.com']);

// Prepare only a public product card. Telegram, not this endpoint, asks the user
// to choose recipients and confirm sending. No message is sent here.
function createHandler({env=process.env,request=fetch,now=Date.now,allow=createDistributedGuard(env,request)}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Origin');
  const origin=req.headers.origin;
  if(!origins.has(origin))return res.status(403).json({error:'origin'});
  res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  if(req.method==='OPTIONS'){res.statusCode=204;return res.end()}
  if(req.method!=='POST'){res.setHeader('Allow','POST, OPTIONS');return res.status(405).json({error:'method'})}
  const token=readToken(env);
  if(env.VERCEL_ENV!=='production'||!token)return res.status(503).json({error:'unavailable'});
  try{
   const body=await readBody(req);
   if(!body||!validInitData(body.init_data,token,now()))return res.status(401).json({error:'telegram'});
   const user=JSON.parse(new URLSearchParams(body.init_data).get('user')||'null');
   if(!Number.isSafeInteger(user?.id)||user.id<=0||user.is_bot)return res.status(401).json({error:'telegram'});
   const id=String(body.product_id||''),size=body.size??'';
   if(!/^[1-9]\d{0,15}$/.test(id)||!Number.isSafeInteger(Number(id))||typeof size!=='string'||size.length>100)return res.status(400).json({error:'product'});
   // Separate share admission from bot messages. High IDs do not collide with
   // Telegram's update IDs; the existing shared guard bounds all replicas.
   if(!await allow('share:'+user.id,randomInt(2**46,2**47),'callback')){
    res.setHeader('Retry-After','60');return res.status(429).json({error:'rate_limit'});
   }
   const response=await request(config.url+'/rest/v1/products?select=id,brand,name,size,available&id=eq.'+id+'&available=eq.true&limit=1',{
    headers:{apikey:config.key},redirect:'error',signal:AbortSignal.timeout(5000)
   });
   if(!response.ok)throw Error();
   const rows=await response.json(),product=Array.isArray(rows)&&rows[0];
   if(!product||String(product.id)!==id||product.available!==true)return res.status(404).json({error:'product'});
   if(size&&!sizes.parse(product.size).includes(size))return res.status(400).json({error:'size'});
   const title=[product.brand,product.name].filter(Boolean).join(' — ').slice(0,240)||'Вещь JULI.PROZ';
   const url='https://t.me/JuliProzBot/shop?startapp=p_'+id;
   const text=title+(size?'\nРазмер / вариант: '+size:'')+'\nАртикул: '+id+'\n'+url;
   const prepared=await request('https://api.telegram.org/bot'+token+'/savePreparedInlineMessage',{
    method:'POST',headers:{'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(8000),
    body:JSON.stringify({user_id:user.id,allow_user_chats:true,allow_bot_chats:true,allow_group_chats:true,allow_channel_chats:true,
     result:{type:'article',id:'product_'+id,title,input_message_content:{message_text:text},reply_markup:{inline_keyboard:[[{text:'Открыть вещь',url}]]}}})
   });
   if(!prepared.ok)throw Error();
   const data=await prepared.json();
   if(data?.ok!==true||typeof data.result?.id!=='string'||!data.result.id||data.result.id.length>512||!Number.isSafeInteger(data.result.expiration_date)||data.result.expiration_date<=now()/1000)throw Error();
   return res.status(200).json({id:data.result.id,expiration_date:data.result.expiration_date});
  }catch(error){
   // Never expose request URLs, signed launch data, or bot credentials.
   const status=error.status===413?413:error instanceof SyntaxError?400:503;
   return res.status(status).json({error:status===503?'unavailable':'invalid'});
  }
 };
}
module.exports={createHandler};
