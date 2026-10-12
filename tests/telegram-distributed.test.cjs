'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createDistributedGuard} = require('../server/telegram-limit.cjs');
const {createHandler,webhookSecret} = require('../server/telegram.cjs');
const token = `123456789:${'x'.repeat(35)}`;
const env = {VERCEL_ENV:'production', TELEGRAM_BOT_TOKEN:token, TELEGRAM_LIMIT_SECRET:'synthetic-server-key'};
const message = id => ({update_id:id,message:{message_id:1,from:{id:42,is_bot:false},chat:{id:42,type:'private'},text:'/start'}});
const callback = id => ({update_id:id,callback_query:{id:'synthetic',from:{id:42,is_bot:false},message:{message_id:1,chat:{id:42,type:'private'}},data:'jp:menu'}});
async function invoke(handler,body,secret=webhookSecret(token)) {
  const out={headers:{}};
  await handler({method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':secret},body},
    {setHeader(k,v){out.headers[k]=v},status(c){out.status=c;return this},json(b){out.body=b;return this}});
  return out;
}
test('shared requests hash chat IDs and send credentials only to the fixed Supabase endpoint',async()=>{
  const calls=[];
  const allow=createDistributedGuard(env,async(url,o)=>{calls.push({url,o});return {ok:true,json:async()=>true}});
  assert.equal(await allow(42,123,'message'),true);
  assert.equal(calls[0].url,'https://qhgzzhgxwpcctafpzjid.supabase.co/rest/v1/rpc/consume_telegram_update');
  const payload=JSON.parse(calls[0].o.body);
  assert.match(payload.p_chat_hash,/^[a-f0-9]{64}$/);
  assert.equal(payload.p_update_id,123);assert.equal(payload.p_kind,'message');
  assert.equal(payload.p_secret,env.TELEGRAM_LIMIT_SECRET);assert.equal(payload.chat_id,undefined);assert.equal(payload.text,undefined);
  assert.equal(calls[0].o.redirect,'error');assert.ok(calls[0].o.signal);
  await allow(42,124,'callback');assert.equal(JSON.parse(calls[1].o.body).p_chat_hash,payload.p_chat_hash);
});
test('missing credentials, timeouts, denied HTTP responses and malformed results fail closed',async()=>{
  let calls=0;
  await assert.rejects(createDistributedGuard({...env,TELEGRAM_LIMIT_SECRET:undefined},async()=>{calls++})(42,1,'message'));
  assert.equal(calls,0);
  for(const request of [async()=>{throw Error(token)},async()=>({ok:false}),async()=>({ok:true,json:async()=>({allowed:true})})]) {
    await assert.rejects(createDistributedGuard(env,request)(42,1,'message'),e=>e.message==='Shared bot limiter unavailable');
  }
  assert.equal(await createDistributedGuard(env,async()=>({ok:true,json:async()=>false}))(42,1,'message'),false);
});
test('denied callbacks never call Telegram and outage responses preserve retryability',async()=>{
  let telegramCalls=0;
  const api=async()=>{telegramCalls++;return {ok:true}};
  const denied=createHandler(env,undefined,api,undefined,async()=>false);
  assert.deepEqual((await invoke(denied,callback(1))).body,{ok:true});assert.equal(telegramCalls,0);
  const down=createHandler(env,undefined,api,undefined,async()=>{throw Error(token)});
  const failure=await invoke(down,callback(2));assert.equal(failure.status,503);
  assert.equal(failure.headers['Retry-After'],'5');assert.equal(JSON.stringify(failure).includes(token),false);
  assert.equal(telegramCalls,0);
});
test('unauthenticated, malformed and irrelevant updates never reach the database',async()=>{
  let calls=0;
  const handler=createHandler(env,undefined,undefined,undefined,async()=>{calls++;return true});
  assert.equal((await invoke(handler,message(1),'0'.repeat(64))).status,401);
  assert.equal((await invoke(handler,'{')).status,400);
  assert.deepEqual((await invoke(handler,{update_id:2})).body,{ok:true});assert.equal(calls,0);
});
test('100 independent handler instances share admission and duplicate suppression',async()=>{
  // Tests integration across instances; real Postgres locking is verified separately in SQL.
  const seen=new Set();let count=0;
  const admission=async(chat,id)=>{if(seen.has(id)||count>=5)return false;seen.add(id);count++;return true};
  const results=await Promise.all(Array.from({length:100},(_,i)=>invoke(createHandler(env,undefined,undefined,undefined,admission),message(i+1))));
  assert.equal(results.filter(x=>x.body.method==='sendMessage').length,5);
  assert.equal(results.filter(x=>x.body.ok===true).length,95);
  assert.deepEqual((await invoke(createHandler(env,undefined,undefined,undefined,admission),message(1))).body,{ok:true});
});
test('a failed database admission does not consume the local guard',async()=>{
  let down=true;
  const handler=createHandler(env,undefined,undefined,undefined,async()=>{if(down)throw Error();return true});
  assert.equal((await invoke(handler,message(1))).status,503);down=false;
  assert.equal((await invoke(handler,message(1))).body.method,'sendMessage');
});
