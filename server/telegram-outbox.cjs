'use strict';
const {createHmac,timingSafeEqual}=require('node:crypto'),config=require('../config.js'),box=require('./secret-box.cjs');
const PURPOSE='juliproz:bot-delivery:v1';
function createOutbox(env=process.env,request=fetch){
 const secret=env.TELEGRAM_LIMIT_SECRET,token=env.TELEGRAM_BOT_TOKEN;
 async function rpc(name,body){
  if(!secret||!token)throw Error('Delivery unavailable');
  const r=await request(config.url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:config.key,'Content-Type':'application/json'},body:JSON.stringify({p_secret:secret,...body}),redirect:'error',signal:AbortSignal.timeout(5000)});
  if(!r.ok)throw Error('Delivery unavailable');return r.json();
 }
 async function enqueue(updateId,reply,kind,callbackId){
  const hash=createHmac('sha256',token).update(`juliproz:chat-limit:v1:${reply.chat_id}`).digest('hex');
  const payload=box.seal({reply,callback_id:callbackId||null},token,PURPOSE);
  return rpc('store_bot_enqueue',{p_update_id:updateId,p_chat_hash:hash,p_kind:kind,p_payload:payload});
 }
 async function api(method,body,timeout=8000){
  const r=await request(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(timeout)});
  const data=await r.json();return {status:r.status,ok:r.ok&&data.ok===true,data};
 }
 async function drain(updateId=null){
  const jobs=await rpc('store_bot_claim',{p_update_id:updateId});if(!Array.isArray(jobs))throw Error('Delivery unavailable');
  let delivered=0;
  for(const job of jobs){
   let state='retry',delay=Math.min(1800,15*2**Math.min(7,job.attempts)),code='network',messageId=null;
   try{
    const {reply:queuedReply,callback_id}=box.open(job.payload,token,PURPOSE);
    const product=queuedReply.method==='sendProductCard';
    const reply=product?await require('./telegram-product-card.cjs').productCard(queuedReply,request):queuedReply;
    if(!['sendMessage','editMessageText',...(product?['sendPhoto']:[])].includes(reply.method)||!Number.isSafeInteger(reply.chat_id))throw Error('Invalid envelope');
    if(callback_id)await api('answerCallbackQuery',{callback_query_id:callback_id},2500).catch(()=>{});
    const {method,...body}=reply,result=await api(method,body,method==='sendPhoto'?20000:8000);
    if(result.ok||(method==='editMessageText'&&result.status===400&&/message is not modified/i.test(result.data.description||''))){state='delivered';code=null;messageId=result.data.result?.message_id||reply.message_id||null;delivered++}
    else if(result.status===429){code='rate_limit';delay=Math.min(3600,Math.max(delay,Number(result.data.parameters?.retry_after)||60))}
    else if(result.status>=400&&result.status<500){state='failed';code='telegram_'+result.status}
    else code='telegram_unavailable';
    if(product)console.warn('telegram-share',JSON.stringify({stage:'bot_card',product_id:queuedReply.product_id,result:state}));
   }catch{/* Never log a token-bearing URL, recipient or payload. */}
   await rpc('store_bot_finish',{p_update_id:job.update_id,p_lease:job.lease,p_state:state,p_delay:delay,p_code:code,p_message_id:messageId});
  }
  return {processed:jobs.length,delivered};
 }
 return {enqueue,drain};
}
function createCronHandler(env=process.env,outbox=createOutbox(env)){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');const value=req.headers.authorization,expected='Bearer '+env.CRON_SECRET;
  if(req.method!=='GET'||env.VERCEL_ENV!=='production'||!env.CRON_SECRET||typeof value!=='string'||Buffer.byteLength(value)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(value),Buffer.from(expected))){res.statusCode=401;return res.end()}
  try{const result=await outbox.drain();res.statusCode=200;return res.end(JSON.stringify(result))}catch{res.statusCode=503;return res.end('{"error":"delivery_unavailable"}')}
 };
}
module.exports={createOutbox,createCronHandler};
