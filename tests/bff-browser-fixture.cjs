'use strict';
// UI suites keep their domain-specific synthetic REST fixtures. This adapter models
// the public BFF contract; the separate admin-bff.browser suite exercises the real server.
const playwright=require('playwright'),fs=require('node:fs');
const {randomBytes}=require('node:crypto');
const ORIGIN='https://qhgzzhgxwpcctafpzjid.supabase.co';
const glob=(pattern,url)=>pattern instanceof RegExp?pattern.test(url):typeof pattern==='function'?pattern(new URL(url)):new RegExp('^'+String(pattern).replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*').replace(/\?/g,'.')+'$').test(url);
function claims(token){try{return JSON.parse(Buffer.from(token.split('.')[1],'base64url'))}catch{return {aal:'aal1'}}}
async function instrument(context){
 if(context.__bff)return context;context.__bff=true;const routes=[],pages=new WeakMap();let auth=null,deadline=0,handle=null;
 function wrap(target,records){const register=target.route.bind(target),unregister=target.unroute.bind(target);target.unroute=async(pattern,handler)=>{for(let i=records.length-1;i>=0;i--)if(records[i].pattern===pattern&&(!handler||records[i].handler===handler))records.splice(i,1);return unregister(pattern,handler)};target.route=async(pattern,handler,options)=>{records.push({pattern,handler});return register(pattern,handler,options)};return register}
 const original=wrap(context,routes);
 async function dispatch(page,url,method='GET',body,headers={}){
  const entries=[...routes,...(pages.get(page)||[])].reverse(),match=entries.find(r=>glob(r.pattern,url));
  if(!match)return {status:200,json:[]};
  let reply;const req={url:()=>url,method:()=>method,postData:()=>body===undefined?null:typeof body==='string'?body:JSON.stringify(body),postDataJSON:()=>typeof body==='string'?JSON.parse(body):body,postDataBuffer:()=>Buffer.from(typeof body==='string'?body:JSON.stringify(body||{})),headers:()=>Object.fromEntries(Object.entries(headers).map(([k,v])=>[k.toLowerCase(),v])),resourceType:()=> 'fetch'};
  await match.handler({request:()=>req,fulfill:async value=>{reply=value},abort:async()=>{reply={status:503,json:{message:'Synthetic offline'}}},continue:async()=>{reply={status:404,body:''}},fallback:async()=>{reply={status:404,body:''}}});
  return reply||{status:500,json:{message:'Unresolved synthetic route'}};
 }
 function publicSession(){const c=claims(auth.access_token);return {cookie_session:true,user:auth.user,session_id:c.session_id||'synthetic-session',aal:c.aal||'aal1',amr:c.amr||[],expires_at:auth.expires_at||Date.now()/1000+(auth.expires_in||3600),limits:{absolute:new Date(deadline).toISOString(),idle:new Date(deadline).toISOString()},server_now:new Date().toISOString(),csrf:'synthetic-csrf'}}
 async function adopt(page,data){auth=data;if(!deadline)deadline=Date.now()+2592000000;handle=randomBytes(32).toString('hex');await context.addCookies([{name:'jp-fixture-session',value:handle,url:new URL(page.url()).origin,httpOnly:true,sameSite:'Strict'}]);return publicSession()}
 await original('**/api/admin',async route=>{
  const page=route.request().frame().page(),envelope=route.request().postDataJSON(),{path,body}=envelope,method=envelope.method||'GET';
  let result;
  if(path==='/session')result=auth?{json:publicSession()}:{status:401,json:{message:'No fixture cookie'}};
  else if(path==='/session/complete')result={json:publicSession()};
  else if(path==='/session/link-preview')result=await dispatch(page,ORIGIN+'/auth/v1/user','GET',undefined,{Authorization:'Bearer '+body.access_token});
  else if(path==='/session/import'){
   result=await dispatch(page,ORIGIN+'/auth/v1/user','GET',undefined,{Authorization:'Bearer '+body.access_token});
   if((result.status||200)<400)result={json:await adopt(page,{...body,user:result.json||JSON.parse(result.body)})};
  }else if(path==='/session/photo')result=await dispatch(page,body.url,'GET',undefined,{Authorization:'Bearer '+(auth?.access_token||'synthetic-fixture')});
  else if(path==='/session/upload')result={json:{url:ORIGIN+'/storage/v1/object/upload/sign/product-photos/'+body.path+'?token=synthetic'}};
  else {
   result=await dispatch(page,ORIGIN+path,method,body,{...(envelope.headers||{}),Authorization:'Bearer '+(auth?.access_token||'synthetic-fixture')});
   if((result.status||200)<400){const data=result.json||(result.body&&typeof result.body==='string'?JSON.parse(result.body):null);
    if(data?.access_token&&data.refresh_token)result={json:await adopt(page,{...auth,...data})};
    if(path.startsWith('/auth/v1/logout')){auth=null;deadline=0;await context.clearCookies({name:'jp-fixture-session'}).catch(e=>{if(!page.isClosed())throw e})}
   }
  }
  if(result.path){result.body=fs.readFileSync(result.path);delete result.path}
  if(result.status===204)result={json:null};
  if(!page.isClosed())await route.fulfill(result);
 });
 const newPage=context.newPage.bind(context);context.newPage=async(...args)=>{const p=await newPage(...args);const records=[];pages.set(p,records);wrap(p,records);return p};
 return context;
}
const chromium={...playwright.chromium,launch:async(...args)=>{
 const browser=await playwright.chromium.launch(...args),newContext=browser.newContext.bind(browser);
 browser.newContext=async(...options)=>instrument(await newContext(...options));
 browser.newPage=async options=>{const context=await browser.newContext(options);return context.newPage()};return browser;
}};
module.exports={...playwright,chromium};
