'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {productCard}=require('../server/telegram-product-card.cjs');
const {messageResponse,createDurableHandler,webhookSecret}=require('../server/telegram.cjs');
const {createOutbox}=require('../server/telegram-outbox.cjs');
const env={VERCEL_ENV:'production',TELEGRAM_BOT_TOKEN:'123456789:'+'x'.repeat(35),TELEGRAM_LIMIT_SECRET:'1'.repeat(64)};
const update=text=>({update_id:23,message:{message_id:1,from:{id:42,is_bot:false},chat:{id:42,type:'private'},text}});
const requestCard={method:'sendProductCard',chat_id:42,product_id:'501'};
const product={id:501,brand:'Hermès',name:'Haccess',image_url:'images/product.jpg',available:true,price:14500,currency:'EUR',internal_note:'PRIVATE',purchase_price:100};
test('only an explicit private start payload requests a card, with recipient from verified update',()=>{
 assert.deepEqual(messageResponse(update('/start share_501')),requestCard);
 assert.deepEqual(messageResponse(update('/start@JuliProzBot share_501')),requestCard);
 for(const text of ['/start','share_501','/start share_501 999','/start share_0','/start share_9007199254740993','/start share_501&select=*'])assert.notEqual(messageResponse(update(text)).method,'sendProductCard');
 for(const change of [u=>u.message.chat.type='group',u=>u.message.from.id=99,u=>u.message.from.is_bot=true]){const u=update('/start share_501');change(u);assert.equal(messageResponse(u),null)}
 assert.equal(messageResponse(update('/start@OtherBot share_501')),null);
});
test('resolves only a public product and constructs a photo card without client text or private fields',async()=>{
 let call;const card=await productCard({...requestCard,url:'https://evil.invalid',title:'PRIVATE'},async(url,options)=>{call={url,options};return Response.json([product])});
 assert.equal(card.method,'sendPhoto');assert.equal(card.chat_id,42);assert.equal(card.photo,'https://www.juliproz.com/api/telegram-product-photo?id=501');
 assert.equal(card.caption,'Hermès — Haccess\nЦена: € 14\u00a0500\nАртикул: 501\nhttps://t.me/JuliProzBot/shop?startapp=p_501');
 assert.equal(card.reply_markup.inline_keyboard[0][0].url,'https://t.me/JuliProzBot/shop?startapp=p_501');
 assert.doesNotMatch(JSON.stringify(card),/PRIVATE|purchase_price|evil/);assert.ok(call.url.includes('available=eq.true'));assert.equal(call.options.redirect,'error');assert.equal(call.options.headers.Authorization,undefined);
 assert.equal(new URL(call.url).searchParams.get('select'),'id,brand,name,image_url,available,price,currency');
});
test('card uses the current public euro price with storefront rounding and price-on-request fallback',async()=>{
 for(const [change,expected] of [
  [{price:299.6,original_price:450,purchase_price:150,actual_sale_price:200},'Цена: € 300'],
  [{price:'1250',currency:'€'},'Цена: € 1\u00a0250'],
  [{price:1250,currency:null},'Цена: € 1\u00a0250'],
  [{price:null},'Цена по запросу'],[{price:''},'Цена по запросу'],
  [{price:-1},'Цена по запросу'],[{price:'invalid'},'Цена по запросу'],
  [{currency:'USD'},'Цена по запросу']
 ])for(const image_url of ['images/product.jpg',null]){
  const card=await productCard({...requestCard,price:99999},async()=>Response.json([{...product,...change,image_url}]));
  assert.equal(card.caption||card.text,'Hermès — Haccess\n'+expected+'\nАртикул: 501\nhttps://t.me/JuliProzBot/shop?startapp=p_501');
 }
});
test('hidden, removed or mismatched products never disclose their title or photo',async()=>{
 for(const rows of [[],[{...product,available:false}],[{...product,id:999}]]){
  const card=await productCard(requestCard,async()=>Response.json(rows));assert.equal(card.method,'sendMessage');assert.match(card.text,/больше не доступна/);assert.doesNotMatch(JSON.stringify(card),/Haccess|photo|501/);
 }
 const noPhoto=await productCard(requestCard,async()=>Response.json([{...product,image_url:'https://evil.invalid/image.jpg'}]));assert.equal(noPhoto.method,'sendMessage');assert.doesNotMatch(JSON.stringify(noPhoto),/evil/);
});
test('malformed requests and catalogue failures cannot produce a partial card',async()=>{
 let calls=0;for(const change of [{method:'sendPhoto'},{chat_id:-1},{product_id:'501&select=*'},{product_id:'9007199254740993'}])await assert.rejects(()=>productCard({...requestCard,...change},async()=>{calls++}));assert.equal(calls,0);
 for(const request of [async()=>new Response('',{status:503}),async()=>Response.json({error:true}),async()=>{throw Error('unavailable')}])await assert.rejects(()=>productCard(requestCard,request));
});
test('durable delivery checks visibility after admission, sends to requester and retries catalogue outage',async()=>{
 for(const outcome of ['visible','hidden','outage']){
  let envelope,finish,lookup=0;const sent=[];
  const outbox=createOutbox(env,async(url,o)=>{
   if(url.includes('/rest/v1/products?')){lookup++;assert.ok(envelope);return outcome==='outage'?new Response('',{status:503}):Response.json(outcome==='hidden'?[]:[product])}
   const body=JSON.parse(o.body);
   if(url.includes('store_bot_enqueue')){envelope=body;return Response.json('pending')}
   if(url.includes('store_bot_claim'))return Response.json([{update_id:23,payload:envelope.p_payload,lease:'lease',attempts:1}]);
   if(url.includes('store_bot_finish')){finish=body;return Response.json(true)}
   sent.push({url,body});return Response.json({ok:true,result:{message_id:12}});
  });
  await outbox.enqueue(23,requestCard,'message');assert.equal(lookup,0);assert.doesNotMatch(envelope.p_payload,/chat_id|product_id/);
  await outbox.drain(23);assert.equal(lookup,1);assert.equal(finish.p_state,outcome==='outage'?'retry':'delivered');
  if(outcome==='outage')assert.equal(sent.length,0);else {assert.equal(sent.length,1);assert.equal(sent[0].body.chat_id,42);assert.ok(sent[0].url.endsWith(outcome==='visible'?'/sendPhoto':'/sendMessage'));assert.equal(sent[0].body.product_id,undefined)}
 }
});
test('forged webhook never enqueues a card and admitted start keeps existing durable delivery',async()=>{
 let queued=0,delivered=0;
 const handler=createDurableHandler(env,{async enqueue(id,reply,kind){queued++;assert.deepEqual(reply,requestCard);assert.equal(kind,'message');return 'pending'},async drain(){delivered++}});
 async function run(secret){let status;await handler({method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':secret},body:update('/start share_501')},{setHeader(){},status(n){status=n;return this},json(){}});return status}
 assert.equal(await run('invalid'),401);assert.equal(queued,0);assert.equal(await run(webhookSecret(env.TELEGRAM_BOT_TOKEN)),200);assert.equal(queued,1);assert.equal(delivered,1);
});
