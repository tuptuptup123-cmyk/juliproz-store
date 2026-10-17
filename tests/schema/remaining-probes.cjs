'use strict';
const assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto');
module.exports=async db=>{
 const q=(s,a=[])=>db.query(s,a),value=async(s,a=[])=>(await q(s,a)).rows[0]?.v;
 const owner=randomUUID(),sid=randomUUID(),secret='1'.repeat(64),bot='2'.repeat(64),analytics='3'.repeat(64),id='a'.repeat(64),hash=x=>createHash('sha256').update(x).digest();let checks=0;
 await db.exec('reset role');
 await q('insert into auth.users(id) values($1)',[owner]);await q('insert into auth.sessions(id,user_id) values($1,$2)',[sid,owner]);
 await q("insert into public.store_admins(user_id,display_name,access_role) values($1,'Owner','owner')",[owner]);
 await q('insert into store_private.admin_bff_secret values(true,$1)',[hash(secret)]);
 await q('insert into store_private.telegram_limit_secret values(true,$1) on conflict(id) do update set secret_hash=excluded.secret_hash',[hash(bot)]);
 await q("insert into store_private.telegram_limit_global values(true,date_trunc('minute',now()),0,date_trunc('day',now()),0) on conflict(id) do nothing");
 await q('insert into store_private.analytics_gateway_secret values(true,$1) on conflict(singleton) do update set secret_hash=excluded.secret_hash',[hash(analytics)]);
 await db.exec('set role anon');
 for(const table of ['admin_bff_secret','admin_bff_sessions','operational_limits','bot_outbox','client_errors']){await assert.rejects(()=>q('select * from store_private.'+table),e=>e.code==='42501');checks++}
 await assert.rejects(()=>q("select public.store_admin_bff_session('wrong','read',$1)",[id]),e=>e.code==='42501');checks++;
 const payload='ciphertext'.repeat(10),session=await value("select public.store_admin_bff_session($1,'create',$2,$3,$4,$5) as v",[secret,id,payload,sid,owner]);
 assert.ok(Date.parse(session.expires_at)<=Date.now()+30*86400000);checks++;
 const locked=await value("select public.store_admin_bff_session($1,'lock',$2) as v",[secret,id]);
 assert.equal((await value("select public.store_admin_bff_session($1,'lock',$2) as v",[secret,id])).busy,true);checks++;
 await assert.rejects(()=>q("select public.store_admin_bff_session($1,'commit',$2,$3,null,null,$4)",[secret,id,payload,randomUUID()]),e=>e.code==='PT409');checks++;
 const committed=await value("select public.store_admin_bff_session($1,'commit',$2,$3,null,null,$4) as v",[secret,id,payload+'new',locked.lease]);assert.equal(committed.payload,payload+'new');assert.equal(committed.expires_at,session.expires_at);checks++;
 await db.exec('reset role');await q('delete from auth.sessions where id=$1',[sid]);await db.exec('set role anon');assert.equal(await value("select public.store_admin_bff_session($1,'read',$2) as v",[secret,id]),null);checks++;
 const enqueue=()=>value('select public.store_bot_enqueue($1,987654,$2,\'message\',$3) as v',[bot,id,payload]);
 assert.equal(await enqueue(),'pending');assert.equal(await enqueue(),'pending');checks++;
 const jobs=await value('select public.store_bot_claim($1,987654) as v',[bot]);assert.equal(jobs.length,1);assert.equal(jobs[0].attempts,1);assert.deepEqual(await value('select public.store_bot_claim($1,987654) as v',[bot]),[]);checks++;
 assert.equal(await value("select public.store_bot_finish($1,987654,$2,'delivered',10,null,42) as v",[bot,randomUUID()]),false);checks++;
 assert.equal(await value("select public.store_bot_finish($1,987654,$2,'delivered',10,null,42) as v",[bot,jobs[0].lease]),true);assert.equal(await enqueue(),'delivered');checks++;
 await db.exec('reset role');assert.equal((await q('select payload from store_private.bot_outbox where update_id=987654')).rows[0].payload,null);checks++;
 await q('insert into auth.sessions(id,user_id) values($1,$2)',[sid,owner]);
 await db.exec('set role anon');
 const error=()=>value("select public.store_client_error_ingest($1,$2,'website','TypeError','app.js',123,4,'development') as v",[analytics,id]);
 assert.equal(await error(),true);assert.equal(await error(),true);checks++;
 for(let i=2;i<20;i++)assert.equal(await error(),true);assert.equal(await error(),false);checks++;
 await assert.rejects(()=>q('select public.store_operational_health()'),e=>e.code==='42501');checks++;
 const channelEvents=['channel_julia_main','channel_julia_outlet','channel_vasya_main','channel_vasya_outlet'],visitor=randomUUID(),analyticsSession=randomUUID();
 for(const event of channelEvents){assert.equal(await value('select public.store_analytics_gateway_ingest($1,$2,$3,$4,$5,null,\'catalog\',$6,\'website\') as v',[analytics,randomUUID(),visitor,analyticsSession,event,id]),true);checks++}
 await db.exec('reset role');await q("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:owner,session_id:sid,role:'authenticated',aal:'aal2',amr:[{method:'totp',timestamp:Date.now()/1000}]})]);await db.exec('set role authenticated');
 const summary=await value("select public.store_analytics_summary(1,'website') as v");for(const event of channelEvents){assert.equal(summary[event],1);assert.equal(summary.event_visitors[event],1);checks++}
 const health=await value('select public.store_operational_health() as v');assert.equal(health.errors_24h,20);assert.equal(health.bot.delivered_24h,1);assert.equal(JSON.stringify(health).includes(payload),false);checks++;
 await db.exec('reset role');await q("update store_private.client_errors set bucket_at=now()-interval '31 days'");await q("select store_private.operational_retention()");assert.equal((await q('select count(*)::int as n from store_private.client_errors')).rows[0].n,0);checks++;
 console.log(`PASS ${checks} server-session, revocation, queue, privacy, rate and retention probes`);
};
