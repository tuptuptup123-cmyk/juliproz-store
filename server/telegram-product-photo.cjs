'use strict';
const config=require('../config.js'),{photo}=require('./product-page.cjs');
const maxInput=6*1024*1024;
async function jpeg(bytes){
 // InlineQueryResultPhoto requires JPEG. Flatten transparent product photos on
 // white, preserve the full item and remove source metadata by re-encoding.
 return require('sharp')(bytes,{limitInputPixels:40000000,failOn:'warning'})
  .rotate().resize({width:1280,height:1280,fit:'inside',withoutEnlargement:true})
  .flatten({background:'#ffffff'}).jpeg({quality:88}).toBuffer();
}
async function boundedImage(response){
 if(Number(response.headers.get('content-length'))>maxInput)throw Error('size');
 const chunks=[];let length=0;
 for await(const chunk of response.body){length+=chunk.length;if(length>maxInput)throw Error('size');chunks.push(chunk)}
 if(!length)throw Error('empty');
 return Buffer.concat(chunks,length);
}
function createHandler({request=fetch,convert=jpeg}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const end=status=>{res.statusCode=status;res.end()};
  if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');return end(405)}
  const input=new URL(req.url,'https://www.juliproz.com'),id=input.searchParams.get('id');
  if(!/^[1-9]\d{0,15}$/.test(id||'')||!Number.isSafeInteger(Number(id))||input.searchParams.getAll('id').length!==1||[...input.searchParams.keys()].some(k=>k!=='id'))return end(404);
  try{
   // Anonymous visibility is rechecked for every request, including HEAD.
   // Never forward admin cookies/authorization or accept a source URL from callers.
   const productResponse=await request(config.url+'/rest/v1/products?select=id,image_url,available&id=eq.'+id+'&available=eq.true&limit=1',{
    headers:{apikey:config.key},redirect:'error',signal:AbortSignal.timeout(5000)
   });
   if(!productResponse.ok)return end(503);
   const rows=await productResponse.json(),product=Array.isArray(rows)&&rows[0];
   if(!product||String(product.id)!==id||product.available!==true)return end(404);
   const source=photo(product.image_url);if(!source)return end(404);
   const response=await request(source,{redirect:'error',signal:AbortSignal.timeout(8000)});
   if(!response.ok)return end(response.status===404?404:503);
   if(!['image/jpeg','image/png','image/webp'].includes(response.headers.get('content-type')?.split(';')[0]))return end(404);
   const bytes=await convert(await boundedImage(response));
   if(bytes.length>4*1024*1024||bytes[0]!==0xff||bytes[1]!==0xd8)throw Error('jpeg');
   res.setHeader('Content-Type','image/jpeg');res.setHeader('Content-Length',String(bytes.length));
   res.statusCode=200;res.end(req.method==='HEAD'?undefined:bytes);
  }catch{return end(503)}
 };
}
module.exports={createHandler,jpeg};
