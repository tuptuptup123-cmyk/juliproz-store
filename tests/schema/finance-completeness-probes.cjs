'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
module.exports=async db=>{
 const q=(sql,args=[])=>db.query(sql,args),one=async(sql,args=[])=>(await q(sql,args)).rows[0];
 const owner=randomUUID(),staff=randomUUID(),sid=randomUUID(),staffSid=randomUUID();
 await db.exec('reset role; begin');
 try{
  await q('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()),($3,$4,now())',[owner,owner+'@example.invalid',staff,staff+'@example.invalid']);
  await q('insert into auth.sessions(id,user_id) values($1,$2),($3,$4)',[sid,owner,staffSid,staff]);
  await q("insert into public.store_admins(user_id,display_name,access_role) values($1,'Owner','owner'),($2,'Staff','admin')",[owner,staff]);
  const as=async(user,age=0)=>{await db.exec('reset role');await q("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:user,session_id:user===owner?sid:staffSid,role:'authenticated',aal:'aal2',amr:[{method:'totp',timestamp:Math.floor(Date.now()/1000)-age}]})]);await db.exec('set local role authenticated')};
  await as(owner);
  const hidden=(await one("insert into public.products(brand,name,category,on_commission,available,archive_status,price,image_url) values('Brand','Hidden commission','Сумки',true,false,'hidden',0,'https://juliproz-store.vercel.app/images/test.webp') returning id")).id;
  let data=(await one('select public.store_finance_commission() as v')).v;
  assert.ok(data.rows.some(p=>p.product_id===String(hidden)&&p.available===false));
  const missingBefore=data.summary.terms_missing;
  await q("select public.store_save_commission_terms($1,0,'',0)",[hidden]);
  data=(await one('select public.store_finance_commission() as v')).v;
  assert.equal(data.summary.terms_missing,missingBefore,'Payout alone does not identify the owner');
  await q("select public.store_save_commission_terms($1,1,'Client',0)",[hidden]);
  data=(await one('select public.store_finance_commission() as v')).v;
  assert.equal(data.summary.terms_missing,missingBefore-1);assert.ok(data.summary.hidden_cards>=1);
  await db.exec('savepoint stale_terms');
  await assert.rejects(()=>q("select public.store_save_commission_terms($1,1,'Stale',100)",[hidden]),e=>e.code==='40001');
  await db.exec('rollback to stale_terms');
 }finally{await db.exec('rollback; reset role')}
 // Independent fixture tests server-side pagination, not only the first UI page.
 await db.exec('begin');
 try{
  await q('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()),($3,$4,now())',[owner,owner+'@example.invalid',staff,staff+'@example.invalid']);
  await q('insert into auth.sessions(id,user_id) values($1,$2),($3,$4)',[sid,owner,staffSid,staff]);
  await q("insert into public.store_admins(user_id,display_name,access_role) values($1,'Owner','owner'),($2,'Staff','admin')",[owner,staff]);
  const as=async(user,age=0)=>{await db.exec('reset role');await q("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:user,session_id:user===owner?sid:staffSid,role:'authenticated',aal:'aal2',amr:[{method:'totp',timestamp:Math.floor(Date.now()/1000)-age}]})]);await db.exec('set local role authenticated')};
  await as(owner);
  const values={product_label:'Financial completeness fixture',opened_on:'2001-01-01',completed_on:'2001-01-01',status:'completed',quantity:1,amount:100,on_commission:false,received:0,expenses:0,purchase_cost:null};
  for(let i=0;i<35;i++)await q('select public.store_save_finance_entry($1,0,$2)',[randomUUID(),values]);
  await q('select public.store_save_finance_entry($1,0,$2)',[randomUUID(),{...values,purchase_cost:0}]);
  await q('select public.store_save_finance_entry($1,0,$2)',[randomUUID(),{...values,status:'cancelled',received:0}]);
  const report=async(before=null)=>(await one("select public.store_finance_report('2001-01-01','2001-01-01','incomplete',$1) as v",[before])).v;
  let data=await report();assert.equal(data.rows.length,31);assert.equal(data.summary.incomplete_count,35);assert.equal(data.summary.sold_count,35);
  const first=data.rows.slice(0,30);data=await report(first.at(-1).id);assert.equal(data.rows.length,5);assert.equal(data.summary.incomplete_count,35);
  assert.equal(new Set([...first,...data.rows].map(e=>e.id)).size,35);
  const entry=data.rows[0];await q('select public.store_save_finance_entry($1,$2,$3)',[entry.id,entry.revision,{purchase_cost:0}]);
  data=await report();assert.equal(data.summary.incomplete_count,34,'Saved facts remove an operation from the queue');
  await db.exec('savepoint role_check');await as(staff);
  await assert.rejects(report,e=>e.code==='42501');await db.exec('rollback to role_check');
  await as(owner,901);await db.exec('savepoint old_mfa');
  await assert.rejects(report,e=>e.code==='PT403');await db.exec('rollback to old_mfa');
 }finally{await db.exec('rollback; reset role')}
 console.log('PASS hidden commission terms, owner completeness, explicit zero, finance queue pagination and owner/MFA isolation');
};
