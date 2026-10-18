'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),config=require('../config.js'),manifest=new Set(require('../product-assets-manifest.json'));
function createHandler({fetch:request=fetch,readFile=fs.readFile,root=path.resolve(__dirname,'../private-product-assets')}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Origin, Authorization');res.setHeader('X-Content-Type-Options','nosniff');
  if(['https://admin.juliproz.com','https://www.juliproz.com','https://juliproz.com','https://juliproz-store.vercel.app','https://app.juliproz.com'].includes(req.headers.origin)){res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Access-Control-Allow-Headers','authorization');res.setHeader('Access-Control-Allow-Methods','GET, HEAD, OPTIONS')}
  const deny=code=>{res.statusCode=code;res.end()};
  if(req.method==='OPTIONS')return deny(204);
  if(!['GET','HEAD'].includes(req.method))return deny(405);
  const input=new URL(req.url,'https://store.invalid'),asset=input.searchParams.get('path');
  if(!asset||input.searchParams.getAll('path').length!==1||!manifest.has(asset)||!/^[A-Za-z0-9_/-]+\.(?:webp|png|jpe?g)$/.test(asset))return deny(404);
  const canonical='https://juliproz-store.vercel.app/images/'+asset,headers={apikey:config.key},auth=req.headers.authorization;
  if(auth){if(typeof auth!=='string'||!/^Bearer [A-Za-z0-9._-]+$/.test(auth)||auth.length>8192)return deny(401);headers.Authorization=auth}
  const filter='(image_url.eq."'+canonical+'",photos.cs.["'+canonical+'"])';
  try{
   const response=await request(config.url+'/rest/v1/products?select=id&or='+encodeURIComponent(filter)+(auth?'':'&available=eq.true')+'&limit=1',{headers,redirect:'error',signal:AbortSignal.timeout(8000)});
   if(!response.ok)return deny(response.status===401?401:503);
   const rows=await response.json();if(!Array.isArray(rows)||!rows.length)return deny(404);
   const bytes=await readFile(path.join(root,asset));
   if(!auth){const etag='"'+crypto.createHash('sha256').update(bytes).digest('hex')+'"';res.setHeader('ETag',etag);res.setHeader('Cache-Control','private, no-cache, must-revalidate');if(req.headers['if-none-match']===etag){res.statusCode=304;return res.end()}}
   res.setHeader('Content-Type',/\.png$/.test(asset)?'image/png':/\.webp$/.test(asset)?'image/webp':'image/jpeg');
   res.setHeader('Content-Length',String(bytes.length));res.statusCode=200;return res.end(req.method==='HEAD'?undefined:bytes);
  }catch{return deny(503)}
 };
}
module.exports={createHandler};
