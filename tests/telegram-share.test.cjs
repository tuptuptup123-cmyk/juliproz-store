'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{createHmac}=require('node:crypto');
const {createHandler}=require('../server/telegram-share.cjs');
const token='123456789:'+('x'.repeat(35)),now=Date.now();
const env={VERCEL_ENV:'production',TELEGRAM_BOT_TOKEN:token};
function signed(user={id:42},date=Math.floor(now/1000)){
 const p=new URLSearchParams({auth_date:String(date),user:JSON.stringify(user)});
 const check=[...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
 const key=createHmac('sha256','WebAppData').update(token).digest();
 p.set('hash',createHmac('sha256',key).update(check).digest('hex'));return p.toString();
}
async function invoke(options={},body={init_data:signed(),product_id:'501',size:'XL'},headers={},method='POST'){
 const out={headers:{}},calls=[];
 const handler=createHandler({env,now:()=>now,allow:async(...args)=>{calls.push(['guard',args]);return true},request:async(url,o)=>{
  calls.push([url,o]);return {ok:true,json:async()=>url.includes('/rest/')?[{id:501,brand:'Hermès',name:'Haccess',size:'XL',available:true,internal_note:'PRIVATE'}]:{ok:true,result:{id:'prepared-fixture',expiration_date:Math.floor(now/1000)+300}}};
 },...options});
 await handler({method,headers:{origin:'https://app.juliproz.com',...headers},body},{setHeader(k,v){out.headers[k]=v},status(n){out.status=n;return this},json(value){out.body=value},end(){out.status=this.statusCode}});
 return {...out,calls};
}
test('prepares a public card for the authenticated user without sending any message',async()=>{
 const r=await invoke({}, {init_data:signed(),product_id:'501',size:'XL',user_id:999,title:'PRIVATE',url:'https://evil.invalid'});
 assert.equal(r.status,200);assert.equal(r.headers['Cache-Control'],'no-store');
 assert.equal(r.calls[0][1][0],'share:42');assert.ok(r.calls[0][1][1]>=2**46);
 const [url,options]=r.calls[2],payload=JSON.parse(options.body);
 assert.ok(url.endsWith('/savePreparedInlineMessage'));assert.equal(payload.user_id,42);
 assert.equal(payload.allow_channel_chats,true);assert.equal(payload.allow_user_chats,true);
 assert.equal(payload.result.input_message_content.message_text,'Hermès — Haccess\nРазмер / вариант: XL\nАртикул: 501\nhttps://t.me/JuliProzBot/shop?startapp=p_501');
 assert.doesNotMatch(JSON.stringify(payload),/PRIVATE|evil/);assert.equal(options.redirect,'error');assert.ok(options.signal);
 assert.deepEqual(Object.keys(r.body),['id','expiration_date']);
});
test('rejects invalid origin, signature, expired session, unsigned identity and injected product before API calls',async()=>{
 for(const [body,headers,status] of [
  [{init_data:signed(),product_id:501},{origin:'https://evil.invalid'},403],
  [{init_data:signed().replace('42','43'),product_id:501},{},401],
  [{init_data:signed({id:42},Math.floor(now/1000)-86401),product_id:501},{},401],
  [{init_data:signed({id:'42'}),product_id:501},{},401],
  [{init_data:signed(),product_id:'501&select=*'},{},400],
  [{init_data:signed(),product_id:501,size:{}},{},400]
 ]){const r=await invoke({},body,headers);assert.equal(r.status,status);assert.equal(r.calls.length,0)}
 assert.equal((await invoke({},null,{},'GET')).status,405);
 assert.equal((await invoke({},null,{},'OPTIONS')).status,204);
 assert.equal((await invoke({env:{...env,VERCEL_ENV:'preview'}})).status,503);
 assert.equal((await invoke({},'x'.repeat(9000))).status,413);
});
test('rate limit and unavailable or sold product fail closed; errors never contain credentials',async()=>{
 const limited=await invoke({allow:async()=>false});assert.equal(limited.status,429);assert.equal(limited.calls.length,0);
 const missing=await invoke({request:async()=>({ok:true,json:async()=>[]})});assert.equal(missing.status,404);
 const badSize=await invoke({}, {init_data:signed(),product_id:501,size:'PRIVATE'});assert.equal(badSize.status,400);assert.equal(badSize.calls.length,2);
 for(const request of [async()=>{throw Error(token)},async()=>({ok:false}),async()=>({ok:true,json:async()=>({bad:true})})]){
  const r=await invoke({request});assert.ok(r.status>=400);assert.ok(!JSON.stringify(r).includes(token));
 }
});
