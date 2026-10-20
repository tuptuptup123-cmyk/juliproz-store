'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
module.exports=async db=>{
 const q=(s,a=[])=>db.query(s,a),value=async(s,a=[])=>(await q(s,a)).rows[0]?.v;
 const owner=randomUUID(),staff=randomUUID(),sid=randomUUID(),staffSid=randomUUID();
 await db.exec('reset role; begin');
 try{
  await q('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()),($3,$4,now())',[owner,owner+'@example.invalid',staff,staff+'@example.invalid']);
  await q('insert into auth.sessions(id,user_id) values($1,$2),($3,$4)',[sid,owner,staffSid,staff]);
  await q("insert into public.store_admins values($1,'Owner','owner'),($2,'Staff','admin')",[owner,staff]);
  const as=async(user,age=0,aal='aal2')=>{await db.exec('reset role');await q("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:user,session_id:user===owner?sid:staffSid,role:'authenticated',aal,amr:[{method:'totp',timestamp:Math.floor(Date.now()/1000)-age}]})]);await db.exec('set local role authenticated')};
  const rejected=async(fn,code)=>{await db.exec('savepoint denied');await assert.rejects(fn,e=>e.code===code);await db.exec('rollback to denied')};
  await as(owner);
  const read=()=>value("select public.store_business_overview('2001-02-01') as v"),before=await read();
  const photo='https://juliproz-store.vercel.app/images/test.webp';
  for(const [price,commission,available,archive,fulfillment,stock,reserved] of [
   [100,false,true,null,'in_stock',{'M':2,'L':1},true],
   [200,true,false,'hidden','in_stock',null,false],
   [500,false,true,null,'on_order',null,false],
   [0,false,true,null,'in_stock',null,false]
  ])await q('insert into public.products(brand,name,category,size,image_url,price,currency,on_commission,available,archive_status,fulfillment_status,stock_quantities,reserved) values(\'Brand\',\'Fixture\',\'Одежда\',\'M / L\',$1,$2,\'EUR\',$3,$4,$5,$6,$7,$8)',[photo,price,commission,available,archive,fulfillment,stock,reserved]);
  const sold=(await q("insert into public.products(brand,name,category,image_url,price,available,size) values('Brand','Sold fixture','Одежда',$1,900,true,'') returning id,revision",[photo])).rows[0];
  await q("select public.store_record_product_sale($1,$2,$3,current_date,900,'',1)",[randomUUID(),sold.id,sold.revision]);
  let result=await read();assert.equal(result.inventory.catalogue_value-before.inventory.catalogue_value,500);assert.equal(result.inventory.own_value-before.inventory.own_value,300);assert.equal(result.inventory.commission_value-before.inventory.commission_value,200);assert.equal(result.inventory.units-before.inventory.units,5);assert.equal(result.inventory.price_missing-before.inventory.price_missing,1);assert.equal(result.inventory.hidden_cards-before.inventory.hidden_cards,1);assert.equal(result.capital.invested_capital,null);assert.equal(result.goal.return_percent,null);
  const entry=async(values)=>value('select public.store_save_finance_entry($1,0,$2) as v',[randomUUID(),{product_label:'Monthly fixture',opened_on:'2001-02-01',completed_on:'2001-02-01',status:'completed',quantity:1,amount:1000,on_commission:false,received:1000,purchase_cost:600,expenses:100,...values}]);
  await entry({});await entry({on_commission:true,purchase_cost:null,owner_due:700,owner_paid:0,owner_ref:'Owner',expenses:50});
  await entry({status:'active',completed_on:null});await entry({status:'cancelled'});
  await entry({opened_on:'2001-01-31',completed_on:'2001-01-31'});await entry({opened_on:'2001-03-01',completed_on:'2001-03-01'});
  let saved=await value("select public.store_save_monthly_capital('2001-02-01',0,5000) as v");assert.equal(saved.revision,1);
  result=await read();assert.equal(result.sales.revenue,2000);assert.equal(result.sales.profit,550);assert.equal(result.goal.minimum,500);assert.equal(result.goal.stretch,1000);assert.equal(result.goal.return_percent,11);
  const missing=await entry({purchase_cost:null,expenses:null});result=await read();assert.equal(result.sales.profit,null);assert.equal(result.sales.profit_known,550);assert.equal(result.sales.profit_missing,1);assert.equal(result.goal.return_percent,null);
  await value('select public.store_save_finance_entry($1,$2,$3) as v',[missing.id,missing.revision,{purchase_cost:0,expenses:0}]);result=await read();assert.equal(result.sales.profit,1550);assert.equal(result.goal.return_percent,31,'zero costs are explicit facts, return is not capped');
  await entry({amount:100,purchase_cost:2000,expenses:0,received:100});result=await read();assert.equal(result.sales.profit,-350);assert.equal(result.goal.return_percent,-7,'negative returns are retained');
  await rejected(()=>value("select public.store_save_monthly_capital('2001-02-01',0,9000) as v"),'40001');
  for(const amount of [0,-1,1.5,1000000000])await rejected(()=>value("select public.store_save_monthly_capital('2001-02-01',1,$1) as v",[amount]),'22023');
  await rejected(()=>value("select public.store_save_monthly_capital('2001-02-02',0,1000) as v"),'22023');
  await value("select public.store_save_monthly_capital('2001-02-01',1,10000) as v");result=await read();assert.equal(result.capital.revision,2);assert.equal(result.goal.minimum,1000);
  const other=await value("select public.store_business_overview('2001-04-01') as v");assert.equal(other.capital.invested_capital,null);assert.equal(other.sales.revenue,0);assert.equal(other.sales.profit,0);
  await as(staff);await rejected(read,'42501');await rejected(()=>value("select public.store_save_monthly_capital('2001-02-01',2,9000) as v"),'42501');
  await as(owner,901);await rejected(read,'PT403');await as(owner,0,'aal1');await rejected(read,'42501');
  await as(owner);await rejected(()=>q('select * from store_private.monthly_capital'),'42501');
  await db.exec('reset role; set local role anon');await rejected(read,'42501');await db.exec('reset role');
  assert.equal((await q("select count(*)::int as n from store_private.finance_changes where entity='monthly_capital' and record_id='2001-02-01'")).rows[0].n,2);
  await q('delete from auth.sessions where id=$1',[sid]);await as(owner);await rejected(read,'42501');
  console.log('PASS monthly stock/quantities, sold amounts, commissions, date boundaries, unknown/zero/negative profit, ROI, capital revision/history, month isolation and owner/MFA/session guards');
 }finally{await db.exec('rollback; reset role')}
};
