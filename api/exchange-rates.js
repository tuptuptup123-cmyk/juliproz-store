'use strict';
const FRESH_MS=15*60*1000,MAX_AGE_MS=24*60*60*1000,RETRY_MS=60*1000;
let cached=null,cachedAt=0,pending=null,retryAt=0;
async function refresh(){
 const response=await fetch('https://www.xe.com/currencyconverter/convert/?Amount=1&From=EUR&To=USD',{signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error();
 const html=await response.text(),json=html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];if(!json)throw Error();
 const data=JSON.parse(json).props?.pageProps?.initialRatesData,base=data?.rates?.EUR;
 if(!Number.isFinite(base)||base<=0||!Number.isFinite(data?.timestamp)||data.timestamp>Date.now()+300000||Date.now()-data.timestamp>MAX_AGE_MS)throw Error();
 const rates={EUR:1},bounds={USD:[.5,2],GBP:[.4,1.5],AED:[2,8]};
 for(const [currency,[min,max]] of Object.entries(bounds)){const rate=data.rates[currency]/base;if(!Number.isFinite(rate)||rate<min||rate>max)throw Error();rates[currency]=rate}
 cached={date:new Date(data.timestamp).toISOString().slice(0,10),rates,source:'XE',asOf:data.timestamp};cachedAt=Date.now();retryAt=0;
}
module.exports=async(req,res)=>{
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'})}
 if(!cached||Date.now()-cachedAt>FRESH_MS){
  if(!pending&&Date.now()>=retryAt)pending=refresh().catch(()=>{retryAt=Date.now()+RETRY_MS}).finally(()=>{pending=null});
  if(pending)await pending;
 }
 if(!cached||Date.now()-cachedAt>MAX_AGE_MS||Date.now()-cached.asOf>MAX_AGE_MS){res.setHeader('Cache-Control','public, max-age=0, s-maxage=60');return res.status(503).json({error:'Exchange rates unavailable'})}
 const stale=Date.now()-cachedAt>FRESH_MS;
 res.setHeader('Cache-Control',stale?'public, max-age=0, s-maxage=60':'public, max-age=300, s-maxage=300');
 return res.status(200).json({...cached,stale});
};
