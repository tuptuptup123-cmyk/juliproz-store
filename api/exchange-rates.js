'use strict';
let cached=null,cachedAt=0;
module.exports=async(req,res)=>{
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 try{
  if(!cached||Date.now()-cachedAt>900000){
   const response=await fetch('https://www.xe.com/currencyconverter/convert/?Amount=1&From=EUR&To=USD',{signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error();
   const html=await response.text(),json=html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];if(!json)throw Error();
   const data=JSON.parse(json).props?.pageProps?.initialRatesData,base=data?.rates?.EUR;
   if(!(base>0)||!Number.isFinite(data.timestamp))throw Error();const rates={EUR:1};
   for(const currency of ['USD','GBP','AED']){const rate=data.rates[currency]/base;if(!Number.isFinite(rate)||rate<=0)throw Error();rates[currency]=rate}
   cached={date:new Date(data.timestamp).toISOString().slice(0,10),rates,source:'XE'};cachedAt=Date.now();
  }
  res.setHeader('Cache-Control','public, max-age=300');return res.status(200).json(cached);
 }catch{return res.status(503).json({error:'Exchange rates unavailable'})}
};
