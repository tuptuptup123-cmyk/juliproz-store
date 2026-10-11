'use strict';

// Only the same public fields and anonymous permissions used by the storefront.
const FIELDS='id,created_at,brand,name,category,size,price,currency,image_url,available,fulfillment_status,gender,description,photos,reserved,product_condition,stock_quantities,on_commission,original_price,wear_condition';
const keys=FIELDS.split(',');
function createHandler({config=require('../config.js'),fetch:fetcher=globalThis.fetch}={}){
  // Coalesce simultaneous cold requests on one instance; no durable process cache.
  let pending=null;
  async function read(){
    const rows=[],signal=AbortSignal.timeout(12000);
    for(let offset=0;offset<10000;offset+=500){
      const response=await fetcher(`${config.url}/rest/v1/products?select=${FIELDS}&available=eq.true&order=created_at.desc,id.desc&limit=500&offset=${offset}`,{headers:{apikey:config.key},signal});
      if(!response.ok)throw Error('Catalogue unavailable');
      const page=await response.json();
      if(!Array.isArray(page)||page.length>500||page.some(p=>!p||p.available!==true))throw Error('Invalid catalogue');
      rows.push(...page.map(p=>Object.fromEntries(keys.filter(k=>Object.hasOwn(p,k)).map(k=>[k,p[k]]))));
      if(page.length<500)return rows;
    }
    throw Error('Catalogue limit exceeded');
  }
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'})}
    if(new URL(req.url,'https://store.invalid').search)return res.status(400).json({error:'Query parameters are not supported'});
    try{
      if(!pending)pending=read().finally(()=>{pending=null});
      const rows=await pending;
      res.setHeader('Cache-Control','public, max-age=0, must-revalidate');
      res.setHeader('Vercel-CDN-Cache-Control','public, s-maxage=30, stale-while-revalidate=30');
      return res.status(200).json(rows);
    }catch{return res.status(503).json({error:'Catalogue temporarily unavailable'})}
  };
}
module.exports={createHandler,FIELDS};
