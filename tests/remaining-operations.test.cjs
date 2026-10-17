'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{createOutbox}=require('../server/telegram-outbox.cjs'),{createHandler}=require('../server/client-errors.cjs'),{createDurableHandler,webhookSecret}=require('../server/telegram.cjs');
const env={VERCEL_ENV:'production',TELEGRAM_BOT_TOKEN:'123456789:'+'x'.repeat(35),TELEGRAM_LIMIT_SECRET:'1'.repeat(64),ANALYTICS_INGEST_SECRET:'2'.repeat(64)};
test('durable webhook acknowledges only after enqueue and leaves delivery outage retryable',async()=>{
 const update={update_id:23,message:{message_id:1,from:{id:42,is_bot:false},chat:{id:42,type:'private'},text:'/start'}};let queued=0;
 async function run(queue){const result={};await createDurableHandler(env,queue)({method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':webhookSecret(env.TELEGRAM_BOT_TOKEN)},body:update},{setHeader(){},status(code){result.status=code;return this},json(data){result.data=data}});return result}
 assert.equal((await run({async enqueue(){queued++;return 'pending'},async drain(){throw Error('outage')}})).status,200);assert.equal(queued,1);
 assert.equal((await run({async enqueue(){throw Error('database unavailable')}})).status,503);
});
test('outbox encrypts recipients, records success, retries 429 and marks permanent failures',async()=>{
 for(const [status,data,state] of [[200,{ok:true,result:{message_id:12}},'delivered'],[429,{ok:false,parameters:{retry_after:60}},'retry'],[403,{ok:false},'failed']]){
  let envelope,finish;
  const outbox=createOutbox(env,async(url,o)=>{
   const b=JSON.parse(o.body);if(url.includes('store_bot_enqueue')){envelope=b;return new Response('"pending"')}
   if(url.includes('store_bot_claim'))return Response.json([{update_id:23,payload:envelope.p_payload,lease:'lease',attempts:1}]);
   if(url.includes('store_bot_finish')){finish=b;return Response.json(true)}
   return Response.json(data,{status});
  });
  await outbox.enqueue(23,{method:'sendMessage',chat_id:42,text:'Hello'},'message');assert.equal(envelope.chat_id,undefined);assert.doesNotMatch(envelope.p_payload,/Hello|chat_id/);await outbox.drain();assert.equal(finish.p_state,state);if(state==='delivered')assert.equal(finish.p_message_id,12);
 }
});
test('client diagnostics reject personal payload fields and derive surface and IP on the server',async()=>{
 let payload;const handler=createHandler(env,async(url,o)=>{payload=JSON.parse(o.body);return Response.json(true)});
 async function run(body,origin='https://admin.juliproz.com'){const r={};await handler({method:'POST',headers:{origin,'x-vercel-forwarded-for':'192.0.2.1'},body},{setHeader(){},set statusCode(n){r.status=n},end(){}});return r.status}
 const clean={kind:'TypeError',asset:'admin.js',line:120,column:4,release:'development'};
 for(const extra of [{message:'customer@email.invalid'},{stack:'private'},{token:'private'},{url:'https://admin/?token=secret'}])assert.equal(await run({...clean,...extra}),400);
 assert.equal(await run(clean,'https://evil.invalid'),403);assert.equal(await run(clean),202);assert.equal(payload.p_surface,'admin');assert.match(payload.p_ip,/^[a-f0-9]{64}$/);assert.doesNotMatch(JSON.stringify(payload),/192\.0\.2\.1|customer/);
});
