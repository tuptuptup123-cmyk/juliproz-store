'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {generateKeyPairSync,verify}=require('node:crypto');
const {createClient,period,SITE}=require('../server/google-search.cjs');
const {fixture}=require('./admin-bff-fixture.cjs');
const pair=generateKeyPairSync('rsa',{modulusLength:2048});
const env={GOOGLE_SEARCH_SERVICE_ACCOUNT:JSON.stringify({type:'service_account',client_email:'search@juliproz-test.iam.gserviceaccount.com',private_key:pair.privateKey.export({type:'pkcs8',format:'pem'})})};
const NOW=Date.parse('2026-10-17T10:00:00Z');
const row={clicks:12,impressions:120,ctr:.1,position:4.5};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status});
function googleFixture(){
 let time=NOW,mode='ready';const calls=[];
 const client=createClient(env,async(url,options)=>{
  calls.push({url,options});assert.equal(options.redirect,'error');assert.ok(options.signal);
  if(url==='https://oauth2.googleapis.com/token'){
   const params=new URLSearchParams(options.body),assertion=params.get('assertion'),parts=assertion.split('.');
   assert.equal(params.get('grant_type'),'urn:ietf:params:oauth:grant-type:jwt-bearer');
   assert.equal(verify('RSA-SHA256',Buffer.from(parts.slice(0,2).join('.')),pair.publicKey,Buffer.from(parts[2],'base64url')),true);
   const claim=JSON.parse(Buffer.from(parts[1],'base64url'));assert.equal(claim.scope,'https://www.googleapis.com/auth/webmasters.readonly');assert.equal(claim.aud,url);assert.equal(claim.exp-claim.iat,3600);
   return json({access_token:'synthetic-google-token',expires_in:3600});
  }
  assert.equal(url,'https://www.googleapis.com/webmasters/v3/sites/'+encodeURIComponent(SITE)+'/searchAnalytics/query');assert.equal(options.headers.Authorization,'Bearer synthetic-google-token');
  const body=JSON.parse(options.body);assert.equal(body.type,'web');assert.equal(body.dataState,'all');
  if(mode==='denied')return json({error:{message:'Do not expose synthetic credential details'}},403);
  if(mode==='empty')return json({});
  if(mode==='malformed')return json({rows:[{...row,clicks:'invalid'}]});
  const key={date:'2026-10-16',query:'Hermès Birkin',page:SITE+'products/523?lang=en',country:'gbr'}[body.dimensions?.[0]];
  return json({rows:[{...row,...(key?{keys:[key]}:{})}],...(key==='2026-10-16'?{metadata:{first_incomplete_date:key}}:{})});
 },()=>time);
 return {client,calls,mode(value){mode=value},advance(value){time+=value}};
}
test('Google periods use inclusive Pacific dates across UTC midnight and DST',()=>{
 assert.deepEqual(period(7,NOW),{days:7,start:'2026-10-10',end:'2026-10-16',previousStart:'2026-10-03',previousEnd:'2026-10-09',timeZone:'America/Los_Angeles'});
 assert.equal(period(1,Date.parse('2026-10-17T02:00:00Z')).end,'2026-10-15');
 assert.equal(period(7,Date.parse('2026-11-02T09:00:00Z')).start,'2026-10-26');
 for(const value of [0,2,500,'7',null,NaN,{}])assert.throws(()=>period(value,NOW),{status:400});
});
test('server uses a signed read-only grant, exact property, independent totals and deduplicated cache',async()=>{
 const f=googleFixture();const [a,b]=await Promise.all([f.client.load(7),f.client.load(7)]);
 assert.deepEqual(a,b);assert.equal(f.calls.length,7);assert.deepEqual(a.totals,row);assert.equal(a.firstIncompleteDate,'2026-10-16');assert.equal(a.lastDataDate,'2026-10-16');
 assert.equal(a.pages[0].key,SITE+'products/523?lang=en');assert.equal(a.status,'ready');assert.doesNotMatch(JSON.stringify(a),/token|private_key|iam\.gserviceaccount/);
 const queries=f.calls.slice(1).map(call=>JSON.parse(call.options.body));assert.equal(queries.filter(q=>!q.dimensions).length,2);assert.deepEqual(queries.filter(q=>q.dimensions).map(q=>q.dimensions[0]),['date','query','page','country']);
 await f.client.load(7);assert.equal(f.calls.length,7);f.advance(16*60000);await f.client.load(7);assert.equal(f.calls.length,13);
});
test('missing credentials, empty Google response and malformed metrics remain distinct',async()=>{
 let fetched=false;const result=await createClient({},()=>{fetched=true},()=>NOW).load(28);assert.equal(result.status,'not_connected');assert.equal(fetched,false);
 const f=googleFixture();f.mode('empty');const empty=await f.client.load(28);assert.equal(empty.status,'empty');assert.equal(empty.totals,null);assert.deepEqual(empty.daily,[]);
 f.mode('malformed');await assert.rejects(f.client.load(7),{code:'GSC_RESPONSE'});
 await assert.rejects(createClient({GOOGLE_SEARCH_SERVICE_ACCOUNT:'not-json'},()=>{},()=>NOW).load(),{code:'GSC_CONFIG'});
});
test('provider failure is sanitized, throttled and never returns stale success or expires admin login',async()=>{
 const f=googleFixture();await f.client.load(7);f.advance(16*60000);f.mode('denied');
 await assert.rejects(f.client.load(7),error=>error.status===503&&error.code==='GSC_ACCESS'&&!error.message.includes('synthetic'));
 const count=f.calls.length;await assert.rejects(f.client.load(7),{code:'GSC_ACCESS'});assert.equal(f.calls.length,count);
 f.advance(61000);f.mode('ready');assert.equal((await f.client.load(7)).status,'ready');
});
test('Google BFF report requires cookie, CSRF, active membership, MFA and completed setup',async()=>{
 const f=fixture(),path='/reports/google-search';assert.equal((await f.invoke(path,{method:'POST'})).status,401);
 const login=await f.login(),options={cookie:login.cookie,csrf:login.csrf,method:'POST',body:{days:7}};
 assert.equal((await f.invoke(path,{...options,csrf:undefined})).status,403);
 assert.equal((await f.invoke(path,{...options,method:'GET'})).status,405);
 const success=await f.invoke(path,options);assert.equal(success.status,200);assert.equal(success.body.status,'not_connected');assert.match(success.headers['Cache-Control'],/no-store/);
 assert.equal((await f.invoke(path,{...options,body:{days:800}})).status,400);
 f.touchFailure(403);assert.equal((await f.invoke(path,options)).status,403);
 for(const config of [{security:{paused:false,pending:false,access_role:'admin'}},{security:{paused:false,pending:false}},{membership:false},{browser:true},{security:{paused:true,pending:true}},{security:{paused:false,pending:false},browser:true}]){
  const f=fixture(config),login=await f.login();assert.equal((await f.invoke(path,{...login,method:'POST',body:{days:7}})).status,403);
 }
 const pending=fixture(),imported=await pending.invoke('/session/import',{method:'POST',body:{...pending.auth(),type:'invite'}});
 assert.equal((await pending.invoke(path,{cookie:imported.headers['Set-Cookie'].split(';')[0],csrf:imported.body.csrf,method:'POST',body:{days:7}})).status,403);
 const revoked=fixture(),auth=await revoked.login();revoked.revoke();assert.equal((await revoked.invoke(path,{...auth,method:'POST'})).status,401);
});
