'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
module.exports=async db=>{
 const owner=randomUUID(),other=randomUUID(),staff=randomUUID(),sid=randomUUID(),otherSid=randomUUID(),staffSid=randomUUID();
 const q=(sql,args=[])=>db.query(sql,args),val=async(sql,args=[])=>(await q(sql,args)).rows[0]?.v;
 await db.exec('reset role;begin');
 try{
  for(const [uid,session,role] of [[owner,sid,'owner'],[other,otherSid,'owner'],[staff,staffSid,'admin']]){
   await q('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[uid,uid+'@example.invalid']);
   await q('insert into auth.sessions(id,user_id) values($1,$2)',[session,uid]);
   await q('insert into public.store_admins values($1,$2,$3)',[uid,'Partner test',role]);
  }
  await q("insert into store_private.partners(owner_id,id,name,source_url,priority,checked_on) values($1,'P01','Test','https://example.com','A',current_date)",[owner]);
  const as=async(uid,session,aal='aal2')=>{await db.exec('reset role');await q("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:uid,session_id:session,role:'authenticated',aal,amr:[{method:'totp',timestamp:Math.floor(Date.now()/1000)}]})]);await db.exec('set local role authenticated')};
  const deny=async(fn,code)=>{await db.exec('savepoint denied');await assert.rejects(fn,e=>e.code===code);await db.exec('rollback to denied')};
  const read=()=>val('select public.store_partner_list() as v');
  const update=(rev=1,status='На проверке',note='Private note')=>val("select public.store_partner_update('P01',$1,$2,true,$3) as v",[rev,status,note]);
  await as(owner,sid);let list=await read();assert.equal(list.length,1);assert.equal(list[0].owner_id,undefined);
  let changed=await update();assert.equal(changed.notes,'Private note');assert.equal(changed.revision,2);assert.equal(changed.favorite,true);
  await deny(()=>update(1),'40001');await deny(()=>update(2,'invalid'),'22023');await deny(()=>update(2,'На проверке','x'.repeat(10001)),'22023');
  assert.equal((await read())[0].revision,2);
  await deny(()=>q('select * from store_private.partners'),'42501');
  await as(other,otherSid);assert.deepEqual(await read(),[]);await deny(()=>update(2),'40001');
  await as(staff,staffSid);await deny(read,'42501');await deny(()=>update(2),'42501');
  await as(owner,sid,'aal1');await deny(read,'42501');
  await db.exec('reset role;set local role anon');await deny(read,'42501');await deny(()=>update(2),'42501');
  await db.exec('reset role');await q('delete from auth.sessions where id=$1',[sid]);await as(owner,sid);await deny(read,'42501');
  console.log('PASS partner owner isolation, staff/anon/MFA/revoked-session rejection, no direct table access, persistence and revision conflict');
 }finally{await db.exec('rollback;reset role')}
};
