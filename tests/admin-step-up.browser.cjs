'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..'),server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(e,data)=>{res.writeHead(e?404:200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream'});res.end(e?'Missing':data)})});
(async()=>{
 await new Promise(r=>server.listen(8799,r));const browser=await chromium.launch({args:['--no-sandbox']});
 for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));let verified=false,attempts=0,writes=0;
  const user={id:'11111111-1111-4111-8111-111111111111',factors:[{id:'factor-id',factor_type:'totp',status:'verified'}]};
  await page.route('https://qhgzzhgxwpcctafpzjid.supabase.co/**',async route=>{
   const req=route.request(),p=new URL(req.url()).pathname;
   if(p==='/auth/v1/user')return route.fulfill({json:user});
   if(p.endsWith('/challenge'))return route.fulfill({json:{id:'challenge-id'}});
   if(p.endsWith('/verify')){attempts++;if(req.postDataJSON().code!=='123456')return route.fulfill({status:400,json:{message:'Неверный код'}});verified=true;return route.fulfill({json:{user,refresh_token:'test-refresh',expires_in:3600,access_token:'test.'+Buffer.from(JSON.stringify({aal:'aal2',amr:[{method:'totp',timestamp:Math.floor(Date.now()/1000)}]})).toString('base64url')+'.test'}})}
   if(p.endsWith('store_save_finance_entry')){if(!verified)return route.fulfill({status:403,json:{code:'PT403',message:'MFA_STEP_UP_REQUIRED'}});writes++;return route.fulfill({json:{id:req.postDataJSON().p_id,revision:1}})}
   if(p.endsWith('store_finance_report'))return route.fulfill({json:{rows:[],summary:{},today:'2026-10-16'}});
   return route.fulfill({json:[]});
  });
  await page.goto('http://localhost:8799/admin.html');await page.evaluate(user=>{session={user,access_token:'test.'+btoa(JSON.stringify({aal:'aal2',amr:[{method:'totp',timestamp:Date.now()/1000}]}))+'.test',expires_at:Date.now()/1000+3600};adminSecurity.owner=true;$('authArea').classList.add('hidden');$('workspace').classList.remove('hidden');AdminFinance.openEntry(null)},user);
  await page.locator('#financeForm [name=product_label]').fill('Pending order');await page.locator('#financeForm [name=amount]').fill('100');await page.locator('#financeSave').click();await page.locator('#stepUpDialog').waitFor();assert.equal(writes,0);
  await page.locator('#stepUpForm [name=code]').fill('000000');await page.locator('#stepUpForm button[type=submit]').click();await page.locator('#stepUpError').filter({hasText:'Неверный код'}).waitFor();assert.equal(writes,0);assert.equal(await page.locator('#financeForm [name=product_label]').inputValue(),'Pending order');
  await page.locator('#stepUpForm [name=code]').fill('123456');await page.locator('#stepUpForm button[type=submit]').click();await page.locator('#financeDialog').waitFor({state:'hidden'});assert.equal(writes,1);assert.equal(attempts,2);
  await page.evaluate(()=>{AdminFinance.openEntry(null);session.access_token='test.'+btoa(JSON.stringify({aal:'aal2',amr:[{method:'token_refresh',timestamp:Date.now()/1000},{method:'totp',timestamp:Date.now()/1000-901}]}))+'.test'});
  await page.waitForFunction(()=>document.body.classList.contains('mfa-stale'));assert.equal(await page.locator('#financeForm').evaluate(el=>el.inert),true);
  await page.locator('#financeDialog [data-unlock-sensitive]').click();await page.locator('#stepUpDialog').waitFor();await page.locator('#cancelStepUp').click();assert.equal(writes,1);assert.equal(await page.evaluate(()=>Boolean(session)),true);
  await page.evaluate(()=>endSession());assert.deepEqual(errors,[]);await page.close();console.log(width+' PASS stale-mask, failed-code, fresh-code, single write retry, form preservation and cancellation');
 }
 await browser.close();server.close();
})().catch(e=>{console.error(e);server.close();process.exit(1)});
