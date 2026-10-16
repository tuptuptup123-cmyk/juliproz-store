const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..'),headers=Object.fromEntries(require('../apps/admin/vercel.json').headers[0].headers.map(h=>[h.key,h.value]));
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(error,data)=>{res.writeHead(error?404:200,{...headers,'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.webp':'image/webp'})[path.extname(file)]||'application/octet-stream'});res.end(error?'Missing':data)});
});
// Every authentication response is synthetic. No email or live account is used.
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const adminURL=process.env.QA_ADMIN_URL||`http://127.0.0.1:${server.address().port}/admin.html`,browser=await chromium.launch({executablePath:process.env.QA_BROWSER_BINARY||undefined,args:['--no-sandbox']});
 try{
  for(const width of [390,1280]){
   const page=await browser.newPage({viewport:{width,height:900}}),errors=[],calls=[];let verified=false,approved=false,userFailure=true,setupFailure=true,passwordSaved=false;
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async dialog=>{errors.push('Unexpected native dialog: '+dialog.type());await dialog.dismiss()});
   const factor={id:'synthetic-factor',status:'verified',factor_type:'totp'},user=()=>({id:'synthetic-invitee',email:'invitee@example.invalid',factors:verified?[factor]:[]});
   const auth=aal=>({access_token:`synthetic.${Buffer.from(JSON.stringify({aal,amr:aal==='aal2'?[{method:'totp',timestamp:Math.floor(Date.now()/1000)}]:[]})).toString('base64url')}.synthetic`,refresh_token:'synthetic-refresh',expires_in:3600,user:user()});
   await page.route('https://**/*',async route=>{
    const req=route.request(),url=new URL(req.url()),p=url.pathname;
    if(url.origin===new URL(adminURL).origin)return route.continue();
    if(url.hostname!=='qhgzzhgxwpcctafpzjid.supabase.co')return route.fulfill({status:404,body:''});
    calls.push({path:p,method:req.method(),body:req.postData()});
    if(p==='/auth/v1/user'){
     if(userFailure)return route.fulfill({status:503,json:{message:'Synthetic connection interruption'}});
     if(req.method()==='PUT'){assert.equal(req.postDataJSON().password,'synthetic-new-password');passwordSaved=true}
     return route.fulfill({json:user()});
    }
    if(p.endsWith('/touch_store_admin_session')){
     if(setupFailure)return route.fulfill({status:503,json:{message:'Synthetic setup interruption'}});
     const now=Date.now();return route.fulfill({json:{server_now:new Date(now).toISOString(),expires_at:new Date(now+2592000000).toISOString(),idle_expires_at:new Date(now+2592000000).toISOString()}});
    }
    if(p.endsWith('/store_admin_security_status'))return route.fulfill({json:{paused:false,pending:!approved,access_role:approved?'admin':null}});
    if(p.endsWith('/enforce_store_mfa')){assert.ok(approved);return route.fulfill({json:true})}
    if(p==='/auth/v1/factors'){assert.ok(passwordSaved,'invitation password comes before enrollment');return route.fulfill({json:{id:factor.id,totp:{secret:'JBSWY3DPEHPK3PXP',qr_code:'<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><rect width="220" height="220" fill="black"/></svg>'}}})}
    if(p.endsWith('/challenge'))return route.fulfill({json:{id:'synthetic-challenge'}});
    if(p.endsWith('/verify')){assert.deepEqual(req.postDataJSON(),{challenge_id:'synthetic-challenge',code:'123456'});verified=true;return route.fulfill({json:auth('aal2')})}
    if(p==='/rest/v1/store_admins'){assert.ok(approved);return route.fulfill({json:[{user_id:user().id}]})}
    if(p==='/rest/v1/products'){assert.ok(approved&&verified&&passwordSaved);return route.fulfill({json:[]})}
    if(p==='/auth/v1/recover'){assert.equal(url.searchParams.get('redirect_to'),'https://admin.juliproz.com/admin.html');assert.deepEqual(req.postDataJSON(),{email:'invitee@example.invalid'});return route.fulfill({json:{}})}
    if(p==='/auth/v1/logout')return route.fulfill({status:204});
    assert.ok(approved,'private endpoints must wait for owner approval');return route.fulfill({json:{counts:{},healthy:true}});
   });
   const callback=type=>adminURL+'#'+new URLSearchParams({type,access_token:auth('aal1').access_token,refresh_token:'synthetic-refresh',expires_in:'3600'});
   await page.goto(callback('invite'));
   await page.locator('#retryEmailLink').waitFor();assert.equal(new URL(page.url()).hash,'');assert.equal(await page.locator('#login').isHidden(),true);
   userFailure=false;await page.locator('#retryEmailLink').click();await page.locator('#acceptEmailLink').waitFor();
   assert.equal(await page.locator('#emailLinkIdentity').textContent(),'invitee@example.invalid');assert.equal(await page.evaluate(()=>session),null);
   await page.locator('#acceptEmailLink').click();await page.locator('#retryEmailLink').waitFor();setupFailure=false;await page.locator('#retryEmailLink').click();
   await page.locator('#newPassword').waitFor();assert.equal(await page.locator('#newPasswordTitle').textContent(),'Создайте пароль');assert.equal(await page.locator('#login').isHidden(),true);assert.equal(await page.locator('#mfaPanel').isHidden(),true);
   assert.equal(await page.evaluate(()=>localStorage.getItem('jpAdminSession30dV1')),null);
   assert.ok(!calls.some(c=>c.path==='/rest/v1/products'||c.path==='/auth/v1/factors'));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(process.env.QA_OUTPUT){fs.mkdirSync(process.env.QA_OUTPUT,{recursive:true});await page.screenshot({path:path.join(process.env.QA_OUTPUT,`invitation-password-${width}.png`),fullPage:true})}
   await page.locator('#newPassword [name=password]').fill('synthetic-new-password');await page.locator('#newPassword button').click();await page.locator('#mfaPanel').waitFor();
   assert.equal(await page.locator('#newPassword').isHidden(),true);assert.equal(await page.locator('#login').isHidden(),true);
   await page.locator('#mfaVerify [name=code]').fill('123456');await page.locator('#mfaVerify button').click();await page.locator('#pendingAccess').waitFor();
   assert.equal(await page.locator('#workspace').isHidden(),true);assert.equal(await page.evaluate(()=>localStorage.getItem('jpAdminSession30dV1')),null);
   assert.ok(!calls.some(c=>c.path==='/rest/v1/products'));approved=true;await page.locator('#checkPendingAccess').click();await page.locator('#workspace').waitFor();await page.waitForFunction(()=>!busy);
   assert.ok(await page.evaluate(()=>localStorage.getItem('jpAdminSession30dV1')));await page.reload();await page.locator('#workspace').waitFor();await page.waitForFunction(()=>!busy);
   // Recovery for an existing protected account still requires MFA before password changes.
   await page.goto('about:blank');await page.goto(callback('recovery'));await page.locator('#acceptEmailLink').click();await page.locator('#mfaPanel').waitFor();
   assert.equal(await page.locator('#newPassword').isHidden(),true);assert.equal(calls.filter(c=>c.method==='PUT').length,1);
   await page.locator('#mfaVerify [name=code]').fill('123456');await page.locator('#mfaVerify button').click();await page.locator('#newPassword').waitFor();
   assert.equal(await page.locator('#newPasswordTitle').textContent(),'Новый пароль');
   // Expired one-time links get a direct renewal screen, never a silent login fallback.
   await page.goto('about:blank');await page.goto(adminURL+'#error=access_denied&error_code=otp_expired');await page.locator('#renewEmailLink').waitFor();assert.equal(await page.locator('#login').isHidden(),true);assert.equal(new URL(page.url()).hash,'');
   await page.locator('#renewEmailLink [name=email]').fill('invitee@example.invalid');await page.locator('#renewEmailLink button').click();await page.waitForFunction(()=>document.getElementById('emailLinkTitle').textContent==='Проверь почту');
   assert.equal(calls.filter(c=>c.path==='/auth/v1/recover').length,1);assert.deepEqual(errors,[]);await page.close();
   console.log(`PASS ${width}px: invite → identity → password → MFA → owner approval → workspace → reload; transient retry; protected recovery; expired-link renewal`);
  }
 }finally{await browser.close();server.close()}
})().catch(error=>{console.error(error);server.close();process.exitCode=1});
