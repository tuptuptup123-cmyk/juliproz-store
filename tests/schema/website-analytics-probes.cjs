'use strict';
const assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto');
module.exports=async db=>{
 const q=(s,a=[])=>db.query(s,a),value=async(s,a=[])=>(await q(s,a)).rows[0]?.v;
 await db.exec('reset role;begin');
 try{
  // Local isolated database only; roll back the fixture after assertions.
  await db.exec('delete from store_private.analytics_events;delete from store_private.analytics_sessions;delete from store_private.analytics_limits');
  const owner=randomUUID(),staff=randomUUID(),authSession=randomUUID(),staffSession=randomUUID(),v=randomUUID(),v2=randomUUID(),session=randomUUID(),session2=randomUUID(),secret='6'.repeat(64),fingerprint='d'.repeat(64);
  for(const [id,s,role] of [[owner,authSession,'owner'],[staff,staffSession,'admin']]){await q('insert into auth.users(id) values($1)',[id]);await q('insert into auth.sessions(id,user_id) values($1,$2)',[s,id]);await q('insert into public.store_admins(user_id,display_name,access_role) values($1,$2,$3)',[id,'Report fixture',role])}
  await q("insert into public.products(id,brand,name,category,size,image_url,available) values(991001,'Gucci','QA Shoes Model 123','Обувь','40','https://juliproz-store.vercel.app/images/test.webp',true),(991002,'Prada','QA Bag Model 123','Сумки','one size','https://juliproz-store.vercel.app/images/test.webp',true)");
  await q('insert into store_private.analytics_gateway_secret values(true,$1) on conflict(singleton) do update set secret_hash=excluded.secret_hash',[createHash('sha256').update(secret).digest()]);
  const send=(kind,{id=randomUUID(),visitor=v,s=session,category=null,product=null,page=null,key=secret}={})=>value("select public.store_analytics_gateway_ingest_attributed($1,$2,$3,$4,$5,$6,$7,$8,'website','direct',$9) v",[key,id,visitor,s,kind,product,page,fingerprint,category]);
  async function denied(fn){await db.exec('savepoint denied');try{await assert.rejects(fn,e=>e.code==='42501')}finally{await db.exec('rollback to denied;release denied')}}
  await db.exec('set role anon');
  const categoryEvent=randomUUID();assert.equal(await send('category_view',{id:categoryEvent,category:'Обувь',page:'catalog'}),true);
  assert.equal(await send('category_view',{id:categoryEvent,category:'Сумки',page:'catalog'}),true);
  assert.equal(await send('category_view',{category:'private@email.invalid',page:'catalog'}),false);
  assert.equal(await send('category_view',{category:'Обувь',page:'services'}),false);
  await denied(()=>send('category_view',{category:'Обувь',page:'catalog',key:'0'.repeat(64)}));
  assert.equal(await send('page_view',{page:'services'}),true);
  assert.equal(await send('product_view',{product:991001}),true);
  const viewEvent=randomUUID(),cartEvent=randomUUID(),contactEvent=randomUUID();
  assert.equal(await send('product_view',{id:viewEvent,product:991001}),true);
  assert.equal(await send('cart_add',{id:cartEvent,product:991001}),true);
  assert.equal(await send('checkout_open',{id:contactEvent}),true);
  assert.equal(await send('manager_general',{visitor:v2,s:session2}),true);
  // A cart before a product view is not a completed ordered journey.
  const earlyCart=randomUUID(),lateView=randomUUID();
  assert.equal(await send('cart_add',{id:earlyCart,visitor:v2,s:session2,product:991001}),true);
  assert.equal(await send('product_view',{id:lateView,visitor:v2,s:session2,product:991001}),true);
  await db.exec('reset role');
  await q("update store_private.analytics_events set created_at=now()-interval '3 hours' where event_id=$1",[viewEvent]);
  await q("update store_private.analytics_events set created_at=now()-interval '2 hours' where event_id in ($1,$2)",[cartEvent,earlyCart]);
  await q("update store_private.analytics_events set created_at=now()-interval '1 hour' where event_id in ($1,$2)",[contactEvent,lateView]);
  assert.equal(await value('select category v from store_private.analytics_events where event_id=$1',[categoryEvent]),'Обувь');
  // Snapshot must survive a later category edit; never rewrite old event attribution.
  await q("update public.products set category='Одежда' where id=991001");
  await q("insert into store_private.analytics_events(event_id,visitor_id,session_id,event,channel,created_at) values($1,$2,$3,'visit','website',now()-interval '36 hours'),($4,$5,$6,'visit','telegram',now())",[randomUUID(),randomUUID(),randomUUID(),randomUUID(),randomUUID(),randomUUID()]);
  async function as(id,s,aal='aal2'){await db.exec('reset role');await q("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:id,session_id:s,role:'authenticated',aal,amr:[{method:'totp',timestamp:Date.now()/1000}]})]);await db.exec('set role authenticated')}
  await as(owner,authSession);
  const r=await value("select public.store_analytics_summary(1,'website') v");assert.equal(r.report_version,2);assert.equal(r.visitors,2);assert.equal(r.contact_visitors,2);assert.equal(r.contacts,2);assert.equal(r.previous.visitors,1);
  assert.deepEqual(r.funnel,{visitors:2,product:2,cart:1,contact:1});
  const shoes=r.categories.find(c=>c.category==='Обувь');assert.equal(shoes.visits,1);assert.equal(shoes.views,3);assert.equal(shoes.cart,2);assert.equal(r.categories.find(c=>c.category==='Сумки').visits,0);
  assert.equal(r.daily.reduce((n,d)=>n+d.views,0),3);assert.equal(r.daily.reduce((n,d)=>n+d.contacts,0),2);assert.equal(r.pages.find(p=>p.page==='services').views,1);
  const week=await value("select public.store_analytics_summary(7,'website') v");assert.equal(week.daily.length,8);assert.ok(week.daily.some(d=>d.visitors===0));assert.equal(week.daily.at(-1).day,new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv'}).format(new Date()));
  await as(staff,staffSession);await denied(()=>value('select store_private.website_analytics_report(7) v'));
 }finally{await db.exec('reset role;rollback')}
 console.log('PASS detailed website report: real ingestion, snapshots, retry, source/channel isolation, zero days, previous period, ordered journey and owner access');
};
