const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup({gate=200,user=200,invite=200,grant=200,finish=200,network=false}={}){let handler;const calls=[];const context={crypto:require('node:crypto').webcrypto,Deno:{env:{get:k=>({SUPABASE_URL:'https://synthetic.invalid',SUPABASE_ANON_KEY:'synthetic-public',SUPABASE_SERVICE_ROLE_KEY:'synthetic-server-only'}[k])},serve:h=>handler=h},Response,AbortSignal,fetch:async(url,o={})=>{calls.push({url,o});if(network&&url.includes('/invite?'))throw Error('timeout');const status=url.endsWith('/user')?user:url.includes('begin_workspace_invite')?gate:url.includes('finish_workspace_invite')?finish:url.includes('/invite?')?invite:grant;return new Response(JSON.stringify(status===200?url.includes('finish_workspace_invite')?true:url.includes('workspace_team_secure')?{members:[],current_user_id:'owner'}:{}:{code:'PT403',message:'Denied'}),{status})}};vm.runInNewContext(fs.readFileSync(__dirname+'/../supabase/functions/invite-store-admin/index.ts','utf8'),context);return {calls,run:(headers={},body={email:'staff@example.invalid',name:'Staff'},method='POST')=>handler(new Request('https://synthetic.invalid',{method,headers:{'Content-Type':'application/json',...headers},...(method==='POST'?{body:JSON.stringify(body)}:{})}))}}
test('invite API requires bearer auth, owner gate and valid input before any email',async()=>{
 for(const option of [{},{user:401},{gate:403}]){const s=setup(option),headers=Object.keys(option).length?{Authorization:'Bearer synthetic-user'}:{};assert.notEqual((await s.run(headers)).status,200);assert.equal(s.calls.some(c=>c.url.includes('/invite?')),false)}
 const s=setup();assert.equal((await s.run({Authorization:'Bearer synthetic-user',Origin:'https://evil.invalid'})).status,403);assert.equal(s.calls.length,0);
 assert.equal((await s.run({Authorization:'Bearer synthetic-user'},{email:'',name:''})).status,400);
});
test('invites use server credentials only for email and never automatically grant membership',async()=>{
 const s=setup(),r=await s.run({Authorization:'Bearer synthetic-owner'},{email:' Staff@example.invalid ',name:'Staff',actor_id:'forged'});assert.equal(r.status,200);
 const invitation=s.calls.find(c=>c.url.includes('/invite?'));assert.ok(invitation);assert.equal(invitation.o.headers.Authorization,'Bearer synthetic-server-only');assert.deepEqual(JSON.parse(invitation.o.body),{email:'staff@example.invalid'});
 const team=s.calls.find(c=>c.url.includes('store_workspace_team'));assert.equal(team.o.headers.Authorization,'Bearer synthetic-owner');assert.deepEqual(JSON.parse(team.o.body),{});assert.equal(s.calls.some(c=>c.url.includes('add_workspace_admin')),false);
 assert.doesNotMatch(await r.text(),/synthetic-server-only/);assert.equal(r.headers.get('Cache-Control'),'no-store');
});
test('failed invite never grants membership and partial failures give safe retry instructions',async()=>{
 const s=setup({invite:429}),r=await s.run({Authorization:'Bearer synthetic-owner'});assert.equal(r.status,429);assert.equal(s.calls.some(c=>c.url.includes('add_workspace_admin')),false);
 const p=setup({grant:403}),response=await p.run({Authorization:'Bearer synthetic-owner'});assert.equal(response.status,409);assert.match((await response.json()).message,/Приглашение отправлено.*подтвердить отдельно/);
});
test('invitation preflight and responses allow the owned custom domains',async()=>{
 for(const Origin of ['https://admin.juliproz.com']){
  const s=setup();const preflight=await s.run({Origin},null,'OPTIONS');assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),Origin);
  const r=await s.run({Origin,Authorization:'Bearer synthetic-owner'});assert.equal(r.status,200);assert.equal(r.headers.get('Access-Control-Allow-Origin'),Origin);
 }
});

test('invites only allow the isolated admin origin and use its fixed callback',async()=>{
 for(const Origin of ['https://juliproz.com','https://www.juliproz.com','https://juliproz-store.vercel.app','https://evil.invalid']){const s=setup();assert.equal((await s.run({Origin,Authorization:'Bearer synthetic-owner'})).status,403);assert.equal(s.calls.length,0)}
 const s=setup();await s.run({Origin:'https://admin.juliproz.com',Authorization:'Bearer synthetic-owner'});const invite=s.calls.find(c=>c.url.includes('/invite?'));assert.equal(new URL(invite.url).searchParams.get('redirect_to'),'https://admin.juliproz.com/admin.html');
});

test('delivery states distinguish failure, timeout and successfully sent mail',async()=>{
 for(const [options,status] of [[{invite:429},'failed'],[{network:true},'unknown'],[{},'sent']]){
  const s=setup(options);await s.run({Authorization:'Bearer owner'});
  const begin=s.calls.find(c=>c.url.includes('begin_workspace_invite')),finish=s.calls.find(c=>c.url.includes('finish_workspace_invite'));
  assert.equal(JSON.parse(finish.o.body).p_status,status);assert.equal(JSON.parse(begin.o.body).p_operation,JSON.parse(finish.o.body).p_operation);
  assert.equal(finish.o.headers.Authorization,'Bearer synthetic-server-only');
 }
 const s=setup({finish:503}),r=await s.run({Authorization:'Bearer owner'});assert.equal(r.status,409);assert.equal((await r.json()).invitation_sent,true);
 const denied=setup({gate:403}),d=await denied.run({Authorization:'Bearer owner'});assert.equal((await d.json()).code,'PT403');assert.equal(denied.calls.some(c=>c.url.includes('/invite?')),false);
});
