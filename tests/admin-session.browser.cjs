'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {fixture,COOKIE}=require('./admin-bff-fixture.cjs'),f=fixture({browser:true});
const root=path.resolve(__dirname,'..'),KEY='jpAdminSessionInfoV2',DAY=86400000;
const server=http.createServer(async(req,res)=>{
 if(req.url==='/api/admin'){let data='';for await(const chunk of req)data+=chunk;req.body=JSON.parse(data);req.headers['x-vercel-forwarded-for']='192.0.2.1';return f.handler(req,res)}
 const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(e,data)=>{res.writeHead(e?404:200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream'});res.end(e?'Missing':data)});
});
(async()=>{
 await new Promise(r=>server.listen(8796,r));const browser=await chromium.launch({args:['--no-sandbox']});
 try{
  const context=await browser.newContext(),page=await context.newPage(),errors=[],responses=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',async r=>{if(r.url().endsWith('/api/admin'))responses.push(await r.text().catch(()=>''))});
  await context.route('https://**/*',r=>r.fulfill({json:[]}));
  const goto=async p=>{await p.goto('http://localhost:8796/admin.html');await p.waitForFunction(()=>!busy)};
  const settled=async p=>p.waitForFunction(()=>!busy&&!overviewBusy&&!activityPromise);
  await goto(page);await page.locator('#login [name=email]').fill(f.user.email);await page.locator('#login [name=password]').fill('synthetic-password');await page.locator('#login button[type=submit]').click();
  await page.locator('#mfaPanel').waitFor();assert.equal(await page.locator('#workspace').isHidden(),true);
  await page.locator('#mfaVerify [name=code]').fill('123456');await page.locator('#mfaVerify button').click();await page.locator('#workspace').waitFor();await settled(page);
  const deadline=await page.evaluate(()=>sessionClock.snapshot().absolute),cookie=(await context.cookies()).find(c=>c.name===COOKIE);
  assert.ok(cookie);assert.equal(cookie.httpOnly,true);assert.equal(cookie.secure,true);assert.equal(cookie.sameSite,'Strict');assert.ok(cookie.expires>Date.now()/1000+29*86400);
  const exposed=await page.evaluate(()=>({cookie:document.cookie,local:{...localStorage},tab:{...sessionStorage},session}));
  assert.doesNotMatch(JSON.stringify(exposed),/access_token|refresh_token|private-refresh|signed\.|__Host-jp-admin/);
  assert.deepEqual(Object.keys(exposed.local).filter(k=>k===KEY),[KEY]);
  let release;f.touchGate(new Promise(r=>release=r));await page.reload();await page.locator('#sessionRestore').waitFor();assert.equal(await page.locator('#login').isHidden(),true);release();f.touchGate(null);await page.locator('#workspace').waitFor();await settled(page);
  f.touchFailure(503);await page.reload();await page.locator('#retrySessionRestore').waitFor();assert.equal(await page.locator('#login').isHidden(),true);assert.ok((await context.cookies()).some(c=>c.name===COOKIE));f.touchFailure(0);await page.locator('#retrySessionRestore').click();await page.locator('#workspace').waitFor();await settled(page);
  // Server time advances independently of browser storage. Refresh and reload cannot extend it.
  f.advance(29*DAY);await page.reload();await page.locator('#workspace').waitFor();await settled(page);assert.ok(f.rotations>=1);assert.ok(await page.evaluate(()=>sessionClock.state().remaining<2*86400000));
  const page2=await context.newPage();await goto(page2);await page2.locator('#workspace').waitFor();await settled(page2);
  const rotations=f.rotations;f.advance(3600000);await Promise.all([page.evaluate(()=>AdminTransport.request('/session')),page2.evaluate(()=>AdminTransport.request('/session'))]);assert.equal(f.rotations,rotations+1);
  await require('./admin-action-helper.cjs').clickAdminControl(page,'#logout');await page.locator('#login').waitFor();await page2.locator('#login').waitFor();assert.equal(await page2.locator('#inventory').innerText(),'');assert.equal(await page2.evaluate(key=>localStorage.getItem(key),KEY),null);
  await goto(page);assert.equal(await page.locator('#workspace').isHidden(),true);
  assert.doesNotMatch(responses.join('\n'),/access_token|refresh_token|private-refresh|signed\./);assert.deepEqual(errors,[]);assert.ok(deadline>Date.now());
  await context.close();console.log('PASS real BFF: password + MFA, HttpOnly cookie, no browser tokens, reload loading, 503 retry, 29-day reopen, concurrent refresh, cross-tab logout');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
