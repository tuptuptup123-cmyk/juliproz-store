'use strict';
const assert=require('node:assert/strict');
module.exports=async db=>{
 await db.exec('reset role; begin');
 try{
  for(const role of ['anon','authenticated','service_role']){
   const {rows}=await db.query("select has_function_privilege($1,'store_private.operational_retention()','execute') as allowed",[role]);
   assert.equal(rows[0].allowed,false,role+' cannot run maintenance');
  }
  await db.exec(`
   insert into store_private.bot_outbox(update_id,chat_hash,kind,payload,state,created_at,lease,lease_until) values
    (990001,repeat('f',64),'message','encrypted-active','sending',now()-interval '8 days',gen_random_uuid(),now()+interval '1 minute'),
    (990002,repeat('f',64),'message','encrypted-expired','sending',now()-interval '25 hours',gen_random_uuid(),now()-interval '1 minute'),
    (990003,repeat('f',64),'message',null,'delivered',now()-interval '8 days',null,null),
    (990004,repeat('f',64),'message',null,'delivered',now()-interval '1 day',null,null);
   insert into store_private.telegram_limit_updates values(990001,now()-interval '1 second'),(990002,now()+interval '1 hour');
   insert into store_private.telegram_limit_chats values(repeat('d',64),'message',now()-interval '2 minutes',1),(repeat('e',64),'message',date_trunc('minute',now()),1);
   insert into store_private.telegram_limit_chat_days values(repeat('d',64),'message',now()-interval '2 days',1),(repeat('e',64),'message',date_trunc('day',now() at time zone 'UTC') at time zone 'UTC',1);
   insert into cron.job values(990001,'store-operational-retention',true),(990002,'unrelated-job',true);
   insert into cron.job_run_details values
    (990001,990001,'succeeded',now()-interval '31 days'),
    (990001,990002,'succeeded',now()-interval '1 day'),
    (990001,990003,'running',null),
    (990002,990004,'succeeded',now()-interval '31 days');
  `);
  const businessSQL=`select jsonb_build_object('products',(select jsonb_agg(to_jsonb(p) order by id) from public.products p),
   'sales',(select jsonb_agg(to_jsonb(s) order by id) from store_private.product_sales s),
   'finance',(select jsonb_agg(to_jsonb(f) order by id) from store_private.finance_entries f),
   'history',(select jsonb_agg(to_jsonb(h) order by id) from store_private.store_change_log h),
   'archive',(select jsonb_agg(to_jsonb(a) order by id) from store_private.product_archive_migration_backup a)) as data`;
  const before=(await db.query(businessSQL)).rows;
  await db.query('select store_private.operational_retention()');
  const jobs=(await db.query('select update_id::int,state,payload,lease is not null as leased from store_private.bot_outbox where update_id between 990001 and 990004 order by update_id')).rows;
  assert.deepEqual(jobs,[{update_id:990001,state:'sending',payload:'encrypted-active',leased:true},{update_id:990002,state:'failed',payload:null,leased:false},{update_id:990004,state:'delivered',payload:null,leased:false}]);
  assert.deepEqual((await db.query('select update_id::int from store_private.telegram_limit_updates where update_id between 990001 and 990002')).rows,[{update_id:990002}]);
  for(const table of ['telegram_limit_chats','telegram_limit_chat_days']){
   assert.deepEqual((await db.query('select chat_hash from store_private.'+table+" where chat_hash in(repeat('d',64),repeat('e',64))")).rows,[{chat_hash:'e'.repeat(64)}]);
  }
  assert.deepEqual((await db.query('select runid::int from cron.job_run_details where runid between 990001 and 990004 order by runid')).rows,[{runid:990002},{runid:990003},{runid:990004}]);
  assert.deepEqual((await db.query(businessSQL)).rows,before,'maintenance preserves business and audit records');
  console.log('PASS maintenance expiry, active delivery lease, job isolation and business-history preservation');
 }finally{await db.exec('rollback')}
};
