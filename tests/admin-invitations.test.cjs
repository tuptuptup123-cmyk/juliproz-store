const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup({gate=200,user=200,invite=200,grant=200}={}){let handler;const calls=[];const context={Deno:{env:{get:k=>({SUPABASE_URL:'https://synthetic.invalid',SUPABASE_ANON_KEY:'synthetic-public',SUPABASE_SERVICE_ROLE_KEY:'synthetic-server-only'}[k])},serve:h=>handler=h},Response,AbortSignal,fetch:async(url,o={})=>{calls.push({url,o});const status=url.endsWith('/user')?user:url.includes('prepare_workspace_invite')?gate:url.includes('/invite?')?invite:grant;return new Response(JSON.stringify(status===200?url.includes('add_workspace_admin')?{members:[],current_user_id:'owner'}:{}:{message:'Denied'}),{status})}};vm.runInNewContext(fs.readFileSync(__dirname+'/../supabase/functions/invite-store-admin/index.ts','utf8'),context);return {calls,run:(headers={},body={email:'staff@example.invalid',name:'Staff'},method='POST')=>handler(new Request('https://synthetic.invalid',{method,headers:{'Content-Type':'application/json',...headers},...(method==='POST'?{body:JSON.stringify(body)}:{})}))}}
test('invite API requires bearer auth, owner gate and valid input before any email',async()=>{
 for(const option of [{},{user:401},{gate:403}]){const s=setup(option),headers=Object.keys(option).length?{Authorization:'Bearer synthetic-user'}:{};assert.notEqual((await s.run(headers)).status,200);assert.equal(s.calls.some(c=>c.url.includes('/invite?')),false)}
 const s=setup();assert.equal((await s.run({Authorization:'Bearer synthetic-user',Origin:'https://evil.invalid'})).status,403);assert.equal(s.calls.length,0);
 assert.equal((await s.run({Authorization:'Bearer synthetic-user'},{email:'',name:''})).status,400);
});
test('invites use server credentials only for the auth invite, user identity for grants',async()=>{
 const s=setup(),r=await s.run({Authorization:'Bearer synthetic-owner'},{email:' Staff@example.invalid ',name:'Staff',actor_id:'forged'});assert.equal(r.status,200);
 const invitation=s.calls.find(c=>c.url.includes('/invite?'));assert.ok(invitation);assert.equal(invitation.o.headers.Authorization,'Bearer synthetic-server-only');assert.deepEqual(JSON.parse(invitation.o.body),{email:'staff@example.invalid'});
 const grant=s.calls.find(c=>c.url.includes('add_workspace_admin'));assert.equal(grant.o.headers.Authorization,'Bearer synthetic-owner');assert.deepEqual(JSON.parse(grant.o.body),{p_email:'staff@example.invalid',p_name:'Staff'});
 assert.doesNotMatch(await r.text(),/synthetic-server-only/);assert.equal(r.headers.get('Cache-Control'),'no-store');
});
test('failed invite never grants membership and partial failures give safe retry instructions',async()=>{
 const s=setup({invite:429}),r=await s.run({Authorization:'Bearer synthetic-owner'});assert.equal(r.status,429);assert.equal(s.calls.some(c=>c.url.includes('add_workspace_admin')),false);
 const p=setup({grant:403}),response=await p.run({Authorization:'Bearer synthetic-owner'});assert.equal(response.status,409);assert.match((await response.json()).message,/Приглашение отправлено.*существующий аккаунт/);
});
