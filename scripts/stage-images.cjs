'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ui=['brand-paw.webp','home-boutique.jpg','home-lifestyle.jpg','ms-fashion-institute-logo.png','money-paw-v1.webp','admin-upload-standard-v1.webp','brands'];
module.exports=function(root,out,{privateAssets=false}={}){
 fs.mkdirSync(path.join(out,'images'),{recursive:true});
 for(const asset of ui){const from=path.join(root,'images',asset);if(fs.existsSync(from))fs.cpSync(from,path.join(out,'images',asset),{recursive:true})}
 if(!privateAssets)return;
 const target=path.join(root,'private-product-assets');fs.rmSync(target,{recursive:true,force:true});fs.mkdirSync(target,{recursive:true});
 const decoded=new Map();
 for(const name of fs.readdirSync(path.join(root,'photo-assets'))){if(!name.endsWith('.json'))continue;const data=JSON.parse(fs.readFileSync(path.join(root,'photo-assets',name),'utf8'));decoded.set(data.path,data)}
 for(const asset of require('../product-assets-manifest.json')){
  if(!/^[A-Za-z0-9_/-]+\.(?:webp|png|jpe?g)$/.test(asset))throw Error('Invalid product asset path');
  const to=path.join(target,asset);fs.mkdirSync(path.dirname(to),{recursive:true});const data=decoded.get(asset);
  if(data){const bytes=Buffer.from(data.base64,'base64');if(crypto.createHash('sha256').update(bytes).digest('hex')!==data.sha256)throw Error('Photo checksum mismatch');fs.writeFileSync(to,bytes)}
  else fs.copyFileSync(path.join(root,'images',asset),to);
 }
};
