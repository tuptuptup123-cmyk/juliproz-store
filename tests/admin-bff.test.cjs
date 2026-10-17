'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture,COOKIE}=require('./admin-bff-fixture.cjs');
test('BFF sets host-only HttpOnly cookies and never returns access or refresh tokens',async()=>{
 const f=fixture(),{r,cookie,csrf}=await f.login();assert.match(cookie,new RegExp('^'+COOKIE+'='));
 assert.match(r.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Strict/);assert.doesNotMatch(r.headers['Set-Cookie'],/Domain=|Max-Age=/);
 assert.equal(r.headers['Cache-Control'],'private, no-store');assert.equal(r.body.cookie_session,true);assert.doesNotMatch(JSON.stringify(r.body),/access_token|refresh_token|private-refresh|signature/);
 const complete=await f.invoke('/session/complete',{cookie,csrf,method:'POST'});assert.equal(complete.status,200);assert.match(complete.headers['Set-Cookie'],/Max-Age=2592000/);
 const row=[...f.rows.values()][0];assert.doesNotMatch(row.payload,/refresh|signed/);
});
test('cross-origin, missing custom header and forged CSRF requests fail before upstream writes',async()=>{
 const f=fixture(),{cookie,csrf}=await f.login();const n=f.calls.length;
 for(const bad of [{origin:'https://evil.invalid'},{origin:'https://www.juliproz.com'},{header:''}])assert.equal((await f.invoke('/rest/v1/products',{cookie,csrf,method:'DELETE',...bad})).status,403);
 assert.equal((await f.invoke('/rest/v1/products',{cookie,csrf:'0'.repeat(64),method:'DELETE'})).status,403);assert.equal(f.calls.length,n);
 for(const path of ['https://evil.invalid/','//evil.invalid','/auth/v1/admin/users','/rest/v1/rpc/store_admin_bff_session','/storage/v1/bucket'])assert.equal((await f.invoke(path,{cookie,csrf})).status,400);
});
test('reload keeps the session, serialized refresh rotates once across concurrent requests',async()=>{
 const f=fixture(),{cookie}=await f.login();const first=(await f.invoke('/session',{cookie})).body;f.advance(3600000);
 const results=await Promise.all([f.invoke('/session',{cookie}),f.invoke('/session',{cookie})]);assert.ok(results.every(x=>x.status===200));assert.equal(f.rotations,1);assert.equal(results[0].body.limits.absolute,first.limits.absolute);assert.equal(results[0].headers['Set-Cookie'],undefined);
});
test('transient upstream failures retain session; revocation clears cookie and rejects reads',async()=>{
 const f=fixture(),{cookie,csrf}=await f.login();f.outage(true);assert.equal((await f.invoke('/auth/v1/user',{cookie,csrf})).status,503);assert.equal(f.rows.size,1);
 f.outage(false);assert.equal((await f.invoke('/session',{cookie})).status,200);f.revoke();const denied=await f.invoke('/rest/v1/products',{cookie,csrf});assert.equal(denied.status,401);assert.match(denied.headers['Set-Cookie'],/Max-Age=0/);
});
test('MFA refresh changes server credentials and returns only claims; logout deletes vault row',async()=>{
 const f=fixture(),{cookie,csrf}=await f.login();const r=await f.invoke('/auth/v1/factors/factor/verify',{cookie,csrf,method:'POST',body:{challenge_id:'challenge',code:'123456'}});assert.equal(r.status,200);assert.equal(r.body.aal,'aal2');assert.doesNotMatch(JSON.stringify(r.body),/access_token|refresh_token/);
 assert.equal((await f.invoke('/auth/v1/logout?scope=local',{cookie,csrf,method:'POST'})).status,200);assert.equal(f.rows.size,0);assert.equal((await f.invoke('/session',{cookie})).status,401);
});
test('legacy migration refreshes expired browser credentials before checking user',async()=>{
 const f=fixture(),old=f.auth();f.advance(86400000);const r=await f.invoke('/session/import',{method:'POST',body:old});assert.equal(r.status,200);assert.equal(f.rotations,1);assert.doesNotMatch(JSON.stringify(r.body),/access_token|refresh_token/);
});
test('an accepted invitation survives reload and cannot complete before its password is set',async()=>{
 const f=fixture(),r=await f.invoke('/session/import',{method:'POST',body:{...f.auth(),type:'invite'}}),cookie=r.headers['Set-Cookie'].split(';')[0],csrf=r.body.csrf;
 assert.equal((await f.invoke('/session',{cookie})).body.setup_flow,'invite');assert.equal((await f.invoke('/session/complete',{cookie,csrf,method:'POST'})).status,403);
 assert.equal((await f.invoke('/auth/v1/user',{cookie,csrf,method:'PUT',body:{password:'long-synthetic-password'}})).status,200);
 assert.equal((await f.invoke('/session',{cookie})).body.setup_flow,null);assert.equal((await f.invoke('/session/complete',{cookie,csrf,method:'POST'})).status,200);
});
test('password recovery cannot bypass an enrolled second factor through the API',async()=>{
 const f=fixture({browser:true}),{cookie,csrf}=await f.login();
 assert.equal((await f.invoke('/auth/v1/user',{cookie,csrf,method:'PUT',body:{password:'long-synthetic-password'}})).status,403);
});
test('photo reads and uploads get narrowly scoped Storage capabilities without exposing the JWT',async()=>{
 const f=fixture(),{cookie,csrf}=await f.login(),name=f.user.id+'/fixture.webp',origin=require('../config.js').url;
 for(const prefix of ['/storage/v1/object/public/product-photos/','/functions/v1/product-photo/']){
  const r=await f.invoke('/session/photo',{cookie,csrf,method:'POST',body:{url:origin+prefix+name}});assert.equal(r.status,200);assert.equal(r.body.photo_url,origin+'/storage/v1/object/sign/product-photos/'+name+'?token=short-capability');
  const call=f.calls.at(-1);assert.deepEqual(JSON.parse(call.options.body),{expiresIn:60});assert.match(call.options.headers.Authorization,/^Bearer signed\./);assert.doesNotMatch(JSON.stringify(r.body),/signed\.|access_token|refresh_token/);
 }
 assert.equal((await f.invoke('/session/upload',{cookie,csrf,method:'POST',body:{path:name}})).status,200);
 for(const url of ['https://evil.invalid/image.webp',origin+'/storage/v1/object/public/product-photos/x?token=secret'])assert.equal((await f.invoke('/session/photo',{cookie,csrf,method:'POST',body:{url}})).status,400);
 for(const path of ['other-user/file.webp',f.user.id+'/../file.webp'])assert.equal((await f.invoke('/session/upload',{cookie,csrf,method:'POST',body:{path}})).status,400);
});
