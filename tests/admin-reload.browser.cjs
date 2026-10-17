const {chromium}=require('./bff-browser-fixture.cjs'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..'),adminURL=process.env.QA_ADMIN_URL||'http://localhost:8783/admin.html';
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream'});res.end(err?'Missing':data)})});
(async()=>{
 await new Promise(r=>server.listen(8783,r));const browser=await chromium.launch({executablePath:process.env.QA_BROWSER_BINARY||undefined,args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  let passwordLogins=0,verifications=0,sessionStart=0,touchGate=null,touchFailure=0;
  const user={id:'synthetic-owner',email:'synthetic@example.invalid',factors:[{id:'synthetic-factor',status:'verified',factor_type:'totp'}]};
  const auth=aal=>({access_token:`synthetic.${Buffer.from(JSON.stringify({aal,amr:aal==='aal2'?[{method:'totp',timestamp:Math.floor(Date.now()/1000)}]:[]})).toString('base64url')}.synthetic`,refresh_token:`synthetic-${aal}-refresh`,expires_at:Date.now()/1000+3600,user});
  await page.route('https://**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin===new URL(adminURL).origin)return route.continue();if(url.hostname!=='qhgzzhgxwpcctafpzjid.supabase.co')return route.fulfill({status:404,body:''});
   if(url.pathname==='/auth/v1/token'){passwordLogins++;sessionStart=Date.now();return route.fulfill({json:auth('aal1')})}
   if(url.pathname.endsWith('/challenge'))return route.fulfill({json:{id:'synthetic-challenge'}});
   if(url.pathname.endsWith('/verify')){verifications++;return route.fulfill({json:auth('aal2')})}
   if(url.pathname==='/auth/v1/user')return route.fulfill({json:user});
   if(url.pathname==='/auth/v1/logout')return route.fulfill({status:204});
   if(url.pathname.endsWith('touch_store_admin_session')){
    if(touchGate)await touchGate;
    if(touchFailure)return route.fulfill({status:touchFailure,json:{message:'Synthetic service unavailable'}});
    const now=Date.now();return route.fulfill({json:{server_now:new Date(now).toISOString(),expires_at:new Date(sessionStart+2592000000).toISOString(),idle_expires_at:new Date(sessionStart+2592000000).toISOString()}});
   }
   if(url.pathname.endsWith('store_admin_security_status'))return route.fulfill({json:{paused:false,access_role:'owner'}});
   if(url.pathname==='/rest/v1/store_admins')return route.fulfill({json:[{user_id:user.id}]});
   if(url.pathname==='/rest/v1/products')return route.fulfill({json:[]});
   return route.fulfill({json:{counts:{},healthy:true}});
  });
  await page.goto(adminURL);
  await page.locator('#login [name=email]').fill(user.email);await page.locator('#login [name=password]').fill('synthetic-password');await page.locator('#login button[type=submit]').click();
  await page.locator('#mfaPanel').waitFor();assert.equal(await page.locator('#workspace').isHidden(),true);
  await page.locator('#mfaVerify [name=code]').fill('123456');await page.locator('#mfaVerify button[type=submit]').click();await page.locator('#workspace').waitFor();await page.waitForFunction(()=>!busy);
  const deadline=await page.evaluate(()=>sessionClock.snapshot().absolute);
  assert.deepEqual(await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('jpAdminSessionInfoV2'))).sort()),['absolute','session_id','user_id']);
  let release;touchGate=new Promise(resolve=>release=resolve);
  await page.reload();await page.locator('#sessionRestore').waitFor();assert.equal(await page.locator('#login').isHidden(),true);assert.equal(await page.locator('#workspace').isHidden(),true);
  release();touchGate=null;await page.locator('#workspace').waitFor();
  for(let i=0;i<2;i++){await page.waitForFunction(()=>!busy&&!overviewBusy);await page.reload();await page.locator('#workspace').waitFor();assert.ok(await page.evaluate(deadline=>{const value=sessionClock.snapshot().absolute;return value<=deadline&&value>deadline-2000},deadline),'reload cannot extend the session deadline');assert.equal(await page.locator('#mfaPanel').isHidden(),true)}
  touchFailure=503;await page.waitForFunction(()=>!busy&&!overviewBusy);await page.reload();await page.locator('#retrySessionRestore').waitFor();
  assert.equal(await page.locator('#login').isHidden(),true);assert.equal(await page.locator('#workspace').isHidden(),true);assert.ok(await page.evaluate(()=>localStorage.getItem('jpAdminSessionInfoV2')));
  touchFailure=0;await page.locator('#retrySessionRestore').click();await page.locator('#workspace').waitFor();
  assert.equal(passwordLogins,1);assert.equal(verifications,1);assert.ok(await page.evaluate(deadline=>{const value=sessionClock.snapshot().absolute;return value<=deadline&&value>deadline-2000},deadline),'reload cannot extend the session deadline');
  touchFailure=403;await page.waitForFunction(()=>!busy&&!overviewBusy);await page.reload();await page.locator('#login').waitFor();assert.equal(await page.locator('#sessionRestore').isHidden(),true);assert.equal(await page.evaluate(()=>localStorage.getItem('jpAdminSessionInfoV2')),null);
  assert.deepEqual(errors,[]);
  console.log('PASS password → MFA → repeated reload; no login flash while restoring; 503 → retry without credentials; revoked access clears session');
 }finally{await browser.close();server.close()}
})().catch(error=>{console.error(error);server.close();process.exitCode=1});
