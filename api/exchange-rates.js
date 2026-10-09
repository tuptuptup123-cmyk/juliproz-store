'use strict';
let cached=null,cachedAt=0;
module.exports=async(req,res)=>{
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 try{
  if(!cached||Date.now()-cachedAt>3600000){
   const response=await fetch('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml',{signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error();const xml=await response.text();
   const date=xml.match(/time=['"]([\d-]+)['"]/)?.[1],rates={EUR:1};for(const match of xml.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g))rates[match[1]]=Number(match[2]);
   if(!date||!(rates.USD>0)||!(rates.GBP>0))throw Error();rates.AED=rates.USD*3.6725;cached={date,rates,source:'ECB',aedSource:'USD/AED 3.6725'};cachedAt=Date.now();
  }
  res.setHeader('Cache-Control','public, max-age=300');return res.status(200).json(cached);
 }catch{return res.status(503).json({error:'Exchange rates unavailable'})}
};
