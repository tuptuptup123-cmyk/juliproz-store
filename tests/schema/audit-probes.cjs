'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
module.exports=async db=>{
 const owner=randomUUID(),staff=randomUUID(),outsider=randomUUID(),sessions=[randomUUID(),randomUUID(),randomUUID()];let checks=0;
 const q=(sql,args=[])=>db.query(sql,args),one=async(sql,args=[])=>(await q(sql,args)).rows[0];
 for(const [i,id] of [owner,staff,outsider].entries()){
  await q('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,`user${i}@example.invalid`]);
  await q('insert into auth.sessions(id,user_id) values($1,$2)',[sessions[i],id]);
 }
 await q("insert into public.store_admins(user_id,display_name,access_role) values($1,'Owner','owner'),($2,'Staff','admin')",[owner,staff]);
 async function as(id,age=0,aal='aal2'){
  await db.exec('reset role');
  const claims={sub:id,session_id:sessions[[owner,staff,outsider].indexOf(id)],role:'authenticated',aal,amr:[{method:'token_refresh',timestamp:Date.now()/1000},{method:'totp',timestamp:Math.floor(Date.now()/1000)-age}]};
  await q("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(claims)]);await db.exec('set role authenticated');
 }
 async function denied(fn,code){await assert.rejects(fn,e=>!code||e.code===code);checks++}
 const photo='https://juliproz-store.vercel.app/images/test.webp';
 const add=async(id,available=true,stock=null)=>q('insert into public.products(id,brand,name,category,image_url,available,stock_quantities,size) values($1,\'Brand\',\'Complete Model Ref 123\',\'Обувь\',$2,$3,$4,\'XL; M\')',[id,photo,available,stock]);
 await as(owner);await db.exec('reset role');await add(100,true,{XL:2,M:1});await add(101,false);await add(102,true);await add(103,false);
 await as(staff);
 await denied(()=>q('update public.products set on_commission=true where id=100'),'42501');
 await denied(()=>q('select public.store_void_product_sale(999,1,\'mistake\')'),'42501');
 await denied(()=>q('select public.store_finance_report(current_date,current_date)'),'42501');
 await as(owner,901);
 await denied(()=>q('select public.store_finance_report(current_date,current_date)'),'PT403');
 await denied(()=>q('update public.products set on_commission=true where id=100'),'PT403');
 await denied(()=>q('select public.store_workspace_team_secure()'),'PT403');
 // Refreshing an access token is deliberately insufficient to refresh the TOTP timestamp.
 await as(owner,60);await q('select public.store_finance_report(current_date,current_date)');checks++;
 await q('update public.products set on_commission=true where id=100');
 await as(outsider);assert.equal((await q('select id from public.products where id=101')).rows.length,0);checks++;
 await denied(()=>q('select public.store_workspace_team_secure()'),'42501');
 await db.exec('reset role');await q("select set_config('request.jwt.claims','{}',false)");await db.exec('set role anon');
 assert.equal((await q('select id from public.products where id=101')).rows.length,0);checks++;
 assert.equal((await q('select id from public.products where id=100')).rows.length,1);checks++;
 await denied(()=>q('select * from public.product_admin_notes'),'42501');
 await as(staff);
 const op=randomUUID();let revision=(await one('select revision from public.products where id=100')).revision;
 let sale=(await one('select public.store_record_product_sale($1,100,$2,current_date,100,\'ХL\',1) as v',[op,revision])).v;
 assert.equal(sale.product.stock_quantities.XL,1);checks++;
 const repeated=(await one('select public.store_record_product_sale($1,100,$2,current_date,100,\'XL\',1) as v',[op,revision])).v;
 assert.equal(repeated.already_recorded,true);assert.equal(repeated.sale_id,sale.sale_id);checks++;
 await denied(()=>q('select public.store_record_product_sale($1,100,$2,current_date,101,\'XL\',1)',[op,revision]));
 await denied(()=>q('select public.store_void_product_sale($1,$2,\'mistake\')',[sale.sale_id,sale.product.revision]),'42501');
 await as(owner);const restored=(await one('select public.store_void_product_sale($1,$2,\'mistake\') as v',[sale.sale_id,sale.product.revision])).v;
 assert.equal(restored.product.stock_quantities.XL,2);checks++;
 // Legacy null stock is one item for the entire card, not one of each size.
 revision=(await one('select revision from public.products where id=102')).revision;
 await denied(()=>q('select public.store_record_product_sale($1,102,$2,current_date,100,\'M\',2)',[randomUUID(),revision]));
 sale=(await one('select public.store_record_product_sale($1,102,$2,current_date,100,\'M\',1) as v',[randomUUID(),revision])).v;
 assert.equal(sale.product.available,false);assert.equal(sale.product.archive_status,'sold');checks++;
 // Financial state agrees with sale reversal and never counts the reversed amount twice.
 const report=(await one('select public.store_finance_report(current_date,current_date) as v')).v;
 assert.equal(report.summary.sold_count,1);assert.equal(report.summary.gross,100);checks++;
 await denied(()=>q('update public.products set stock_quantities=\'{"ХL":1,"XL":2}\' where id=103'));
 const sizes=require('../../product-sizes.js');for(const value of ['ХL','М','С','2XL','3XL','XXXXL','one size','o/s','42,5','Длинна: 80']){
  const actual=(await one('select store_private.normalize_variant($1) as value',[value])).value;
  assert.equal(actual,sizes.normalize(value),value);checks++;
 }
 // Hidden drafts don't earn quota. First qualified publication is attributed once to the publisher.
 await as(staff);await q('update public.products set available=true where id=103');
 let items=(await one('select public.store_upload_items(current_date,$1) as v',[staff])).v;
 assert.equal(items.filter(i=>i.product_id==='103').length,1);assert.equal(items.some(i=>i.product_id==='101'),false);checks++;
 await q('update public.products set available=false where id=103');await q('update public.products set available=true where id=103');
 items=(await one('select public.store_upload_items(current_date,$1) as v',[staff])).v;assert.equal(items.filter(i=>i.product_id==='103').length,1);checks++;
 await as(owner);await q('delete from public.products where id=103');items=(await one('select public.store_upload_items(current_date,$1) as v',[staff])).v;
 assert.equal(items.find(i=>i.product_id==='103').exists,false);checks++;
 // Delivery state may only be completed by the service role; failures don't consume the sent quota.
 await as(staff);await denied(()=>q('select public.store_begin_workspace_invite(\'new@example.invalid\',\'New\',$1)',[randomUUID()]),'42501');
 await as(owner,901);await denied(()=>q('select public.store_begin_workspace_invite(\'new@example.invalid\',\'New\',$1)',[randomUUID()]),'PT403');
 await as(owner);let invite=randomUUID();await q('select public.store_begin_workspace_invite(\'new@example.invalid\',\'New\',$1)',[invite]);
 await denied(()=>q('select public.store_finish_workspace_invite($1,\'sent\')',[invite]),'42501');
 await denied(()=>q('select public.store_begin_workspace_invite(\'new@example.invalid\',\'New\',$1)',[randomUUID()]));
 await db.exec('reset role; set role service_role');assert.equal((await one('select public.store_finish_workspace_invite($1,\'failed\') as v',[invite])).v,true);checks++;
 for(let i=0;i<10;i++){
  await as(owner);invite=randomUUID();await q('select public.store_begin_workspace_invite($1,\'New\',$2)',[`test${i}@example.invalid`,invite]);
  await db.exec('reset role; set role service_role');await q('select public.store_finish_workspace_invite($1,\'sent\')',[invite]);
 }
 await as(owner);await denied(()=>q('select public.store_begin_workspace_invite(\'limited@example.invalid\',\'New\',$1)',[randomUUID()]));
 await db.exec('reset role');await q('delete from auth.sessions where id=$1',[sessions[0]]);await as(owner);
 await denied(()=>q('select public.store_finance_report(current_date,current_date)'),'42501');
 await db.exec('reset role');console.log(`PASS ${checks} database role, MFA, sale, stock, quota and invitation checks`);
};
