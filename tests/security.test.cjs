const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');

function node(){
 const classes=new Set();
 return {value:'',textContent:'',innerHTML:'',src:'',dataset:{},files:[],disabled:false,
  classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),toggle(x,v){v?classes.add(x):classes.delete(x)},contains:x=>classes.has(x)},
  addEventListener(){},setAttribute(){},focus(){},reset(){this.resetCount=(this.resetCount||0)+1;if(this.code)this.code.value=''},removeAttribute(n){if(n==='src')this.src=''},scrollIntoView(){}};
}
const factor={id:'synthetic-factor',friendly_name:'My device',factor_type:'totp',status:'verified'};
const jwt=aal=>`synthetic.${Buffer.from(JSON.stringify({aal})).toString('base64url')}.synthetic`;
const user=factors=>({id:'owner',factors});
const session=(aal='aal1',factors=[])=>({access_token:jwt(aal),refresh_token:'synthetic-refresh',expires_in:3600,user:user(factors)});
const response=(body,status=200)=>({ok:status<400,status,json:async()=>body});
function setup(fetch,mfaEnrollmentEnabled=true,sessionStorage,localStorage){
 const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)};
 const context=vm.createContext({sessionStorage,localStorage,document:{getElementById:get,querySelectorAll:()=>[],addEventListener(){}},window:{addEventListener(){},STORE_CONFIG:{url:'https://test.supabase.co',key:'public',mfaEnrollmentEnabled}},fetch,URL,URLSearchParams,atob,AbortController,setTimeout,clearTimeout,structuredClone,crypto,location:{search:''},safeProductImage:()=>true});
 get('editor').elements=Object.fromEntries(['brand','name','size','price','currency','available','fulfillment_status'].map(k=>[k,node()]));
 vm.runInContext(fs.readFileSync(__dirname+'/../product-pricing.js','utf8'),context);
 vm.runInContext(fs.readFileSync(__dirname+'/../admin.js','utf8'),context);
 get('mfaVerify').code=node();
 return {get,run:code=>vm.runInContext(code,context),seed:s=>vm.runInContext('keepSession('+JSON.stringify(s)+')',context)};
}
function api({factors=[],verification=session('aal2',[factor]),activateError=false,paused=false}={}){
 const calls=[];
 return {calls,fetch:async(path,options={})=>{
  calls.push({path,options});
  if(path.includes('/rpc/store_admin_security_status'))return response({paused});
  if(path.includes('/store_admins'))return response([{user_id:'owner'}]);
  if(path.endsWith('/auth/v1/user'))return response(user(factors));
  if(path.endsWith('/challenge'))return response({id:'challenge'});
  if(path.endsWith('/verify')){factors=[factor];return response(verification)}
  if(path.includes('/rpc/enforce_store_mfa')){if(!activateError)paused=false;return response(activateError?{message:'activation unavailable'}:true,activateError?503:200);}
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

test('disabled enrollment feature flag does not call the activation RPC',async()=>{
 const a=api({factors:[factor]}),h=setup(a.fetch,false);h.seed(session('aal2',[factor]));await h.run('enterWorkspace()');
 assert.equal(h.get('securityBtn').classList.contains('hidden'),true);
 await h.get('securityBtn').onclick();
 assert.equal(a.calls.some(c=>c.path.includes('/rpc/enforce_store_mfa')||c.path.endsWith('/auth/v1/factors')),false);
 assert.equal(h.get('workspace').classList.contains('hidden'),false);
});
test('temporary MFA pause applies only to the named admin account',async()=>{
 for(const pausedId of ['owner','another-admin']){
  const a=api({factors:[factor],paused:pausedId==='owner'}),h=setup(a.fetch);h.seed(session('aal1',[factor]));
  await h.run('enterWorkspace()');
  assert.equal(a.calls.some(c=>c.path.includes('/products')),pausedId==='owner');
  assert.equal(a.calls.some(c=>c.path.includes('/rpc/enforce_store_mfa')),false);
  if(pausedId==='owner'){assert.match(h.get('securityState').textContent,/временно отключена/);assert.equal(h.get('securityBtn').classList.contains('hidden'),false)}
 }
});

 test('transient refresh error preserves session, editor and staged photos',async()=>{
 const h=setup(async()=>{throw TypeError('offline')});h.seed(session());h.run("session.expires_at=0;editing=23;editorDirty=true;photos=['draft'];stagedUploads.set('draft','upload')");
 await assert.rejects(h.run('request("/rest/v1/products")'),/offline/);assert.notEqual(h.run('session'),null);assert.equal(h.run('editing'),23);assert.equal(h.run('editorDirty'),true);assert.equal(h.run('stagedUploads.size'),1);
 });

test('new admin without factor must enroll before loading inventory',async()=>{
 const a=api({factors:[]}),h=setup(a.fetch);h.seed(session());await h.run('enterWorkspace()');assert.equal(h.get('mfaPanel').classList.contains('hidden'),false);assert.equal(h.run('mfaMode'),'enroll');assert.equal(a.calls.some(c=>c.path.includes('/products')),false);
});

test('paused owner can resume MFA only after verifying a factor',async()=>{
 const a=api({factors:[factor],paused:true}),h=setup(a.fetch);h.seed(session('aal1',[factor]));await h.run('enterWorkspace()');assert.equal(h.run('mfaPaused()'),true);await h.get('securityBtn').onclick();assert.equal(h.run('mfaMode'),'challenge');assert.equal(a.calls.some(c=>c.path.includes('/rpc/enforce_store_mfa')),false);
 h.get('mfaVerify').code.value='123456';await h.get('mfaVerify').onsubmit({preventDefault(){},submitter:node(),target:h.get('mfaVerify')});assert.equal(h.run('mfaPaused()'),false);assert.equal(h.get('workspace').classList.contains('hidden'),false);
});

function tabStorage(saved){const values=new Map(saved?[['jpAdminSessionV1',JSON.stringify(saved)]]:[]);return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}}
test('refresh restores tab session only after server identity and admin checks',async()=>{
 const saved={...session('aal2',[factor]),recovering:false};const storage=tabStorage(saved),a=api({factors:[factor]});
 const h=setup(async(path,options)=>path.includes('grant_type=refresh_token')?response(session('aal2',[factor])):a.fetch(path,options),true,storage);
 await h.run('adminSessionReady');assert.equal(h.run('session.user.id'),'owner');assert.ok(a.calls.some(c=>c.path.includes('/store_admins')));assert.ok(a.calls.some(c=>c.path.endsWith('/auth/v1/user')));assert.ok(a.calls.some(c=>c.path.includes('/products?')));
 assert.ok(storage.getItem('jpAdminSessionV1'));h.run('endSession()');assert.equal(storage.getItem('jpAdminSessionV1'),null);
});
test('revoked saved session is removed and never loads inventory',async()=>{
 const storage=tabStorage(session()),calls=[];const h=setup(async path=>{calls.push(path);return response({message:'Revoked'},401)},true,storage);
 await h.run('adminSessionReady');assert.equal(h.run('session'),null);assert.equal(storage.getItem('jpAdminSessionV1'),null);assert.equal(calls.length,1);assert.ok(calls[0].includes('grant_type=refresh_token'));
});
test('transient restore failure retains saved tokens for retry',async()=>{
 const storage=tabStorage(session());const h=setup(async()=>response({message:'Unavailable'},503),true,storage);await h.run('adminSessionReady');assert.equal(h.run('session'),null);assert.ok(storage.getItem('jpAdminSessionV1'));
});
test('restored aal1 session cannot bypass MFA',async()=>{
 const storage=tabStorage(session()),a=api({factors:[factor]});const h=setup(async(path,options)=>path.includes('grant_type=refresh_token')?response(session()):a.fetch(path,options),true,storage);await h.run('adminSessionReady');assert.equal(h.run('mfaMode'),'challenge');assert.ok(!a.calls.some(c=>c.path.includes('/products?')));
});

test('login persists across new tabs and migrates legacy tab storage',async()=>{
 const local=tabStorage(),legacy=tabStorage(session('aal2',[factor])),a=api({factors:[factor]});const fetch=async(path,options)=>path.includes('grant_type=refresh_token')?response(session('aal2',[factor])):a.fetch(path,options);
 const first=setup(fetch,true,legacy,local);await first.run('adminSessionReady');assert.ok(local.getItem('jpAdminSessionV1'));assert.equal(legacy.getItem('jpAdminSessionV1'),null);
 const second=setup(fetch,true,tabStorage(),local);await second.run('adminSessionReady');assert.equal(second.run('session.user.id'),'owner');second.run('endSession()');assert.equal(local.getItem('jpAdminSessionV1'),null);
});
test('persistent restored session still fails closed when server revokes it',async()=>{
 const local=tabStorage(session()),h=setup(async()=>response({message:'Revoked'},401),true,tabStorage(),local);await h.run('adminSessionReady');assert.equal(h.run('session'),null);assert.equal(local.getItem('jpAdminSessionV1'),null);
});

test('reload with a valid saved access token does not rotate the refresh token',async()=>{
 const saved={...session('aal2',[factor]),expires_at:Date.now()/1000+3600},local=tabStorage(saved),a=api({factors:[factor]});const h=setup(a.fetch,true,tabStorage(),local);await h.run('adminSessionReady');assert.equal(h.run('session.user.id'),'owner');assert.ok(!a.calls.some(c=>c.path.includes('grant_type=refresh_token')));assert.ok(a.calls.some(c=>c.path.endsWith('/auth/v1/user')));assert.equal(h.get('login').classList.contains('hidden'),true);
});

test('successful login initializes home while loading blocks user navigation',async()=>{
 const a=api({paused:true}),h=setup(a.fetch);h.seed(session());
 h.run("busy=true;selectView('settings')");assert.equal(h.run('activeView'),'all');
 await h.run('enterWorkspace()');assert.equal(h.run('activeView'),'home');assert.equal(h.get('homePanel').classList.contains('hidden'),false);assert.equal(h.get('inventoryPanel').classList.contains('hidden'),true);
});
test('cancelled card switch preserves the pending cover and photo studio',()=>{
 const h=setup(async()=>response([]));h.run("editorDirty=true;pendingCover=true;confirm=()=>false;window.PhotoStudio={close(){throw Error('Must stay open')}};edit(null)");assert.equal(h.run('pendingCover'),true);assert.equal(h.run('editorDirty'),true);
});
test('additional photo selections append and invalid batches retain the previous cover',async()=>{
 const h=setup(async()=>response([]));
 h.run("renderPhotos=()=>{};DataTransfer=class{constructor(){this.files=[];this.items={add:f=>this.files.push(f)}}};FileReader=class{readAsDataURL(f){this.result='data:'+f.name;this.onload()}};pendingPreviews=[{file:{name:'first.png'},src:'first'}];pendingCover=true");
 h.get('uploads').files=[{name:'second.png',type:'image/png',size:100}];await h.get('uploads').onchange();
 assert.equal(h.run('pendingPreviews.length'),2);assert.equal(h.get('uploads').files[0].name,'first.png');assert.equal(h.run('pendingCover'),true);
 h.get('uploads').files=[{name:'invalid.exe',type:'application/octet-stream',size:100}];await h.get('uploads').onchange();
 assert.equal(h.run('pendingPreviews.length'),2);assert.equal(h.get('uploads').files.length,2);assert.equal(h.run('pendingCover'),true);assert.match(h.get('status').textContent,/JPG/);
});
test('stock totals exclude hidden and on-order cards, include reservations and convert each currency',()=>{
 const h=setup(async()=>response([]));h.run("items=[{available:true,price:100,currency:'EUR'},{available:true,reserved:true,price:200,currency:'USD'},{available:true,price:80,currency:'GBP'},{available:true,price:734.5,currency:'AED'},{available:false,price:999,currency:'EUR'},{available:true,fulfillment_status:'on_order',price:999,currency:'EUR'},{available:true,price:null}]");
 const s=h.run('stockSummary(items,{USD:2,GBP:.8,AED:7.345})');assert.equal(s.count,5);assert.equal(s.total,400);assert.equal(s.unpriced,1);assert.equal(s.unconverted,0);
 assert.equal(h.run('stockSummary(items,null).unconverted'),3);
});

test('stock overview counts explicit units and multiplies unit prices',()=>{
 const h=setup(async()=>response([]));
 h.run("ProductSizes={stockUnits:p=>Object.values(p.stock_quantities||{'':1}).reduce((a,b)=>a+b,0)};items=[{available:true,size:'One Size',price:100,currency:'EUR',stock_quantities:{'One Size':5}},{available:true,size:'S; M',price:200,currency:'USD',stock_quantities:{S:2,M:0}}]");const s=h.run('stockSummary(items,{USD:2})');assert.equal(s.count,7);assert.equal(s.total,700);
});
