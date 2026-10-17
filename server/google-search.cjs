'use strict';
const {createPrivateKey,sign}=require('node:crypto');
const SITE='https://www.juliproz.com/',TOKEN_URL='https://oauth2.googleapis.com/token';
const SCOPE='https://www.googleapis.com/auth/webmasters.readonly';
const QUERY_URL='https://www.googleapis.com/webmasters/v3/sites/'+encodeURIComponent(SITE)+'/searchAnalytics/query';
const DAY=86400000,TTL=15*60000,TZ='America/Los_Angeles';
const fail=(code,message)=>Object.assign(Error(message),{status:503,code});
function period(days,now=Date.now()){
 if(![1,7,28,90].includes(days))throw Object.assign(Error('Выберите период: вчера, 7, 28 или 90 дней.'),{status:400,code:'GSC_PERIOD'});
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 const midnight=Date.parse(today+'T00:00:00Z'),date=n=>new Date(midnight-n*DAY).toISOString().slice(0,10);
 return {days,start:date(days),end:date(1),previousStart:date(days*2),previousEnd:date(days+1),timeZone:TZ};
}
function metrics(row){
 if(!row)return null;
 if(!['clicks','impressions','ctr','position'].every(k=>Number.isFinite(row[k])&&row[k]>=0)||row.ctr>1)throw fail('GSC_RESPONSE','Google вернул неполный отчёт. Попробуйте позже.');
 return {clicks:row.clicks,impressions:row.impressions,ctr:row.ctr,position:row.impressions?row.position:null};
}
function rows(data,limit){
 if(data.rows!==undefined&&!Array.isArray(data.rows))throw fail('GSC_RESPONSE','Google вернул неполный отчёт. Попробуйте позже.');
 return (data.rows||[]).slice(0,limit).map(row=>({key:String(row.keys?.[0]||'').slice(0,4096),...metrics(row)}));
}
function createClient(env=process.env,request=fetch,now=()=>Date.now()){
 let credentials,credentialError,token,tokenUntil=0,tokenFlight=null;
 const cache=new Map(),flights=new Map(),failures=new Map();
 if(env.GOOGLE_SEARCH_SERVICE_ACCOUNT){
  try{
   const parsed=JSON.parse(env.GOOGLE_SEARCH_SERVICE_ACCOUNT);
   if(parsed.type!=='service_account'||!/^[-a-z0-9]+@[-a-z0-9]+\.iam\.gserviceaccount\.com$/i.test(parsed.client_email)||typeof parsed.private_key!=='string')throw Error();
   const key=createPrivateKey(parsed.private_key);if(key.asymmetricKeyType!=='rsa')throw Error();
   credentials={email:parsed.client_email,key};
  }catch{credentialError=fail('GSC_CONFIG','Подключение Google требует настройки владельцем.');}
 }
 async function accessToken(){
  if(token&&tokenUntil>now()+60000)return token;
  if(tokenFlight)return tokenFlight;
  tokenFlight=(async()=>{
   const stamp=Math.floor(now()/1000),encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
   const unsigned=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iss:credentials.email,scope:SCOPE,aud:TOKEN_URL,iat:stamp,exp:stamp+3600});
   const assertion=unsigned+'.'+sign('RSA-SHA256',Buffer.from(unsigned),credentials.key).toString('base64url');
   const response=await request(TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}).toString(),redirect:'error',signal:AbortSignal.timeout(10000)});
   const data=await response.json().catch(()=>null);
   if(!response.ok||typeof data?.access_token!=='string'||!Number.isFinite(data.expires_in)||data.expires_in<=0)throw fail('GSC_AUTH','Не удалось подтвердить подключение Google. Владельцу нужно проверить доступ.');
   token=data.access_token;tokenUntil=now()+Math.min(data.expires_in,3600)*1000;return token;
  })();
  try{return await tokenFlight}finally{tokenFlight=null}
 }
 async function query(body,bearer){
  const response=await request(QUERY_URL,{method:'POST',headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json'},body:JSON.stringify({type:'web',dataState:'all',aggregationType:'auto',...body}),redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok){
   if(response.status===401)token=null;
   if([401,403].includes(response.status))throw fail('GSC_ACCESS','Google не предоставил доступ к отчёту. Владельцу нужно проверить подключение.');
   if(response.status===429)throw fail('GSC_LIMIT','Google временно ограничил запросы. Повторите позже.');
   throw fail('GSC_UNAVAILABLE','Google временно не отдаёт статистику. Попробуйте позже.');
  }
  const data=await response.json().catch(()=>null);
  if(!data||typeof data!=='object'||Array.isArray(data)||data.rows!==undefined&&!Array.isArray(data.rows))throw fail('GSC_RESPONSE','Google вернул неполный отчёт. Попробуйте позже.');
  return data;
 }
 async function load(days=28){
  const range=period(days,now());
  if(credentialError)throw credentialError;
  if(!credentials)return {status:'not_connected',site:SITE,period:range};
  const key=days+':'+range.end;
  for(const [k,value] of cache)if(value.until<=now())cache.delete(k);
  for(const [k,value] of failures)if(value.until<=now())failures.delete(k);
  if(cache.has(key))return cache.get(key).data;
  if(failures.has(key))throw failures.get(key).error;
  if(flights.has(key))return flights.get(key);
  const flight=(async()=>{
   try{
    const bearer=await accessToken(),base={startDate:range.start,endDate:range.end};
    // Independent totals preserve anonymous queries and must not be summed from top rows.
    const results=await Promise.allSettled([
     query({...base,rowLimit:1},bearer),
     query({startDate:range.previousStart,endDate:range.previousEnd,rowLimit:1},bearer),
     query({...base,dimensions:['date'],rowLimit:90},bearer),
     ...['query','page','country'].map(dimension=>query({...base,dimensions:[dimension],rowLimit:10},bearer))
    ]);
    const error=results.find(result=>result.status==='rejected');if(error)throw error.reason;
    const [total,previous,daily,queries,pages,countries]=results.map(result=>result.value);
    const totals=metrics(total.rows?.[0]),trend=rows(daily,90).sort((a,b)=>a.key.localeCompare(b.key));
    const data={status:totals?'ready':'empty',site:SITE,period:range,totals,previous:metrics(previous.rows?.[0]),daily:trend,queries:rows(queries,10),pages:rows(pages,10),countries:rows(countries,10),updatedAt:new Date(now()).toISOString(),lastDataDate:trend.at(-1)?.key||null,firstIncompleteDate:daily.metadata?.first_incomplete_date||null};
    cache.set(key,{data,until:now()+TTL});return data;
   }catch(error){
    const safe=error?.code?.startsWith('GSC_')?error:fail('GSC_UNAVAILABLE','Google временно не отдаёт статистику. Попробуйте позже.');
    failures.set(key,{error:safe,until:now()+60000});throw safe;
   }finally{flights.delete(key)}
  })();
  flights.set(key,flight);return flight;
 }
 return {load};
}
module.exports={createClient,period,SITE};
