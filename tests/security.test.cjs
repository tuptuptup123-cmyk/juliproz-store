const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');

function node(){
 const classes=new Set();
 return {value:'',textContent:'',innerHTML:'',src:'',dataset:{},files:[],disabled:false,
  classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),toggle(x,v){v?classes.add(x):classes.delete(x)},contains:x=>classes.has(x)},
  reset(){this.resetCount=(this.resetCount||0)+1;if(this.code)this.code.value=''},removeAttribute(n){if(n==='src')this.src=''},scrollIntoView(){}};
}
const factor={id:'synthetic-factor',friendly_name:'My device',factor_type:'totp',status:'verified'};
const jwt=aal=>`synthetic.${Buffer.from(JSON.stringify({aal})).toString('base64url')}.synthetic`;
const user=factors=>({id:'owner',factors});
const session=(aal='aal1',factors=[])=>({access_token:jwt(aal),refresh_token:'synthetic-refresh',expires_in:3600,user:user(factors)});
const response=(body,status=200)=>({ok:status<400,status,json:async()=>body});
function setup(fetch,mfaEnrollmentEnabled=true){
 const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)};
 const context=vm.createContext({document:{getElementById:get},window:{STORE_CONFIG:{url:'https://test.supabase.co',key:'public',mfaEnrollmentEnabled}},fetch,URL,URLSearchParams,atob,AbortController,setTimeout,clearTimeout,structuredClone,crypto,location:{search:''},safeProductImage:()=>true});
 vm.runInContext(fs.readFileSync(__dirname+'/../admin.js','utf8'),context);
 get('mfaVerify').code=node();
 return {get,run:code=>vm.runInContext(code,context),seed:s=>vm.runInContext('keepSession('+JSON.stringify(s)+')',context)};
}
function api({factors=[],verification=session('aal2',[factor]),activateError=false}={}){
 const calls=[];
 return {calls,fetch:async(path,options={})=>{
  calls.push({path,options});
  if(path.includes('/store_admins'))return response([{user_id:'owner'}]);
  if(path.endsWith('/auth/v1/user'))return response(user(factors));
  if(path.endsWith('/challenge'))return response({id:'challenge'});
  if(path.endsWith('/verify')){factors=[factor];return response(verification)}
  if(path.includes('/rpc/enforce_store_mfa'))return response(activateError?{message:'activation unavailable'}:true,activateError?503:200);
  if(path.endsWith('/auth/v1/factors'))return response({id:'new-factor',type:'totp',totp:{secret:'SYNTHETIC-SECRET',qr_code:'<svg xmlns="http://www.w3.org/2000/svg"></svg>'}});
  return response([]);
 }};
}
test('verified-factor password login cannot load inventory before MFA',async()=>{
 const a=api({factors:[factor]}),h=setup(a.fetch);h.seed(session('aal1',[factor]));await h.run('enterWorkspace()');
 assert.equal(h.get('mfaPanel').classList.contains('hidden'),false);
 assert.equal(h.get('workspace').classList.contains('hidden'),true);
 assert.equal(a.calls.some(c=>c.path.includes('/products')),false);
});
test('MFA code is sent with bearer token, promotes session and activates sticky server protection',async()=>{
 const a=api({factors:[factor]}),h=setup(a.fetch);h.seed(session('aal1',[factor]));await h.run('enterWorkspace()');
 h.get('mfaVerify').code.value='123456';
 await h.get('mfaVerify').onsubmit({preventDefault(){},submitter:node(),target:h.get('mfaVerify')});
 assert.equal(h.run('sessionAal()'),'aal2');
 const verify=a.calls.find(c=>c.path.endsWith('/verify'));
 assert.deepEqual(JSON.parse(verify.options.body),{challenge_id:'challenge',code:'123456'});
 assert.equal(verify.options.headers.Authorization,`Bearer ${jwt('aal1')}`);
 assert.ok(a.calls.some(c=>c.path.includes('/rpc/enforce_store_mfa')));
 assert.ok(a.calls.some(c=>c.path.includes('/products')));
 assert.equal(h.get('mfaVerify').code.value,'');
});
test('failed MFA and failed activation never open inventory',async()=>{
 for(const settings of [{verification:session('aal1',[factor])},{activateError:true}]){
  const a=api({factors:[factor],...settings}),h=setup(a.fetch);h.seed(session('aal1',[factor]));await h.run('enterWorkspace()');h.get('mfaVerify').code.value='123456';
  await h.get('mfaVerify').onsubmit({preventDefault(){},submitter:node(),target:h.get('mfaVerify')});
  assert.equal(a.calls.some(c=>c.path.includes('/products')),false);
  assert.equal(h.get('workspace').classList.contains('hidden'),true);
  assert.ok(h.get('status').textContent);
 }
});
test('enrollment QR is an image and logout clears its secret plus all editor state',async()=>{
 const a=api(),h=setup(a.fetch);h.seed(session());await h.get('securityBtn').onclick();
 assert.match(h.get('mfaQr').src,/^data:image\/svg\+xml/);
 assert.equal(h.get('mfaSecret').textContent,'SYNTHETIC-SECRET');
 h.run('original={name:"private"};creationKey="key";editing=1;stagedUploads.set("file",{blob:"private"});');
 await h.get('logout').onclick();
 assert.equal(h.run('session'),null);assert.equal(h.run('original'),null);assert.equal(h.run('creationKey'),null);assert.equal(h.run('stagedUploads.size'),0);
 assert.equal(h.get('mfaSecret').textContent,'');assert.equal(h.get('mfaQr').src,'');assert.ok(h.get('editor').resetCount);
});
test('server logout failure is distinguished from confirmed logout',async()=>{
 const offline=setup(async()=>{throw Error('offline')});offline.seed(session());await offline.get('logout').onclick();
 assert.equal(offline.run('session'),null);assert.match(offline.get('status').textContent,/Сервер не подтвердил/);
 const online=setup(async()=>response(null,204));online.seed(session());await online.get('logout').onclick();
 assert.equal(online.get('status').textContent,'Вы вышли');
});
test('401 clears session and staged data; refresh failure does the same',async()=>{
 for(const expired of [false,true]){
  const h=setup(async()=>response({message:'Expired'},401));h.seed(session());
  h.run('stagedUploads.set("file",{});original={name:"private"};'+(expired?'session.expires_at=0;':''));
  await assert.rejects(h.run("request('/rest/v1/products')"));
  assert.equal(h.run('session'),null);assert.equal(h.run('stagedUploads.size'),0);assert.equal(h.run('original'),null);
 }
});
test('email recovery for MFA account requires second factor before changing password',async()=>{
 const a=api({factors:[factor]}),h=setup(a.fetch);h.seed(session('aal1',[factor]));h.run('recovering=true');await h.run('enterWorkspace()');
 assert.equal(h.get('newPassword').classList.contains('hidden'),true);
 h.get('mfaVerify').code.value='123456';await h.get('mfaVerify').onsubmit({preventDefault(){},submitter:node(),target:h.get('mfaVerify')});
 assert.equal(h.get('newPassword').classList.contains('hidden'),false);
 assert.equal(a.calls.some(c=>c.path.includes('/products')),false);
});
test('unknown user and forged account response cannot enter workspace',async()=>{
 const h=setup(async path=>path.includes('/store_admins')?response([{user_id:'owner'}]):response({id:'wrong'}));h.seed(session());
 await assert.rejects(h.run('enterWorkspace()'),/проверить аккаунт/);assert.equal(h.run('session'),null);
});

test('production default disables enrollment and does not call undeployed RPC',async()=>{
 const a=api({factors:[factor]}),h=setup(a.fetch,false);h.seed(session('aal2',[factor]));await h.run('enterWorkspace()');
 assert.equal(h.get('securityBtn').classList.contains('hidden'),true);
 await h.get('securityBtn').onclick();
 assert.equal(a.calls.some(c=>c.path.includes('/rpc/')||c.path.endsWith('/auth/v1/factors')),false);
 assert.equal(h.get('workspace').classList.contains('hidden'),false);
});
