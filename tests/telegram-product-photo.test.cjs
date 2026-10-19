'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),sharp=require('sharp');
const {createHandler,jpeg}=require('../server/telegram-product-photo.cjs');
const config=require('../config.js');
const source='https://juliproz-store.vercel.app/images/test.webp';
const product={id:65,available:true,image_url:source};
async function invoke({row=product,method='GET',url='/api/telegram-product-photo?id=65',response,convert}={}){
 const calls=[],out={headers:{}},body=response||new Response(await sharp({create:{width:8,height:8,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).webp().toBuffer(),{headers:{'content-type':'image/webp'}});
 const handler=createHandler({convert,request:async(url,options)=>{calls.push({url,options});return url.includes('/rest/v1/products?')?{ok:true,json:async()=>row?[row]:[]}:body}});
 await handler({method,url,headers:{authorization:'Bearer MUST_NOT_FORWARD',cookie:'PRIVATE'}},{setHeader(k,v){out.headers[k]=v},end(data){out.status=this.statusCode;out.body=data}});
 return {...out,calls};
}
test('public cover is a real JPEG with white transparency and no credentials forwarded',async()=>{
 const result=await invoke();assert.equal(result.status,200);
 assert.equal(result.headers['Content-Type'],'image/jpeg');assert.equal(result.headers['Cache-Control'],'no-store');
 const metadata=await sharp(result.body).metadata();assert.equal(metadata.format,'jpeg');assert.equal(metadata.hasAlpha,false);
 const pixel=await sharp(result.body).raw().toBuffer();assert.deepEqual([...pixel.subarray(0,3)],[255,255,255]);
 assert.match(result.calls[0].url,/available=eq.true/);assert.deepEqual(result.calls[0].options.headers,{apikey:config.key});
 assert.equal(result.calls[1].url,source);assert.equal(result.calls[1].options.headers,undefined);
 assert.ok(result.calls.every(c=>c.options.redirect==='error'&&c.options.signal));
 const head=await invoke({method:'HEAD'});assert.equal(head.status,200);assert.equal(head.body,undefined);assert.equal(head.calls.length,2);
});
test('hidden items, untrusted sources and malformed requests cannot serve photos',async()=>{
 for(const row of [null,{...product,available:false},{...product,id:66},{...product,image_url:'https://evil.invalid/photo.jpg'},{...product,image_url:source+'?secret=hidden'}]){
  const result=await invoke({row});assert.equal(result.status,404);assert.equal(result.calls.length,1);
 }
 for(const url of ['/api/telegram-product-photo','/api/telegram-product-photo?id=65&id=66','/api/telegram-product-photo?id=65&url=https://evil.invalid','/api/telegram-product-photo?id=0','/api/telegram-product-photo?id=65%26select=*']){
  const result=await invoke({url});assert.equal(result.status,404);assert.equal(result.calls.length,0);
 }
 const post=await invoke({method:'POST'});assert.equal(post.status,405);assert.equal(post.calls.length,0);
});
test('storage photos use their public visibility gateway',async()=>{
 const result=await invoke({row:{...product,image_url:config.url+'/storage/v1/object/public/product-photos/owner/photo.webp'}});
 assert.equal(result.status,200);assert.equal(result.calls[1].url,config.url+'/functions/v1/product-photo/owner/photo.webp');
});
test('image fetches reject redirects, unexpected MIME, excessive length and excessive streamed data',async()=>{
 for(const response of [new Response(null,{status:302}),new Response('html',{headers:{'content-type':'text/html'}}),new Response('too large',{headers:{'content-type':'image/jpeg','content-length':String(7*1024*1024)}}),new Response(Buffer.alloc(6*1024*1024+1),{headers:{'content-type':'image/jpeg'}})]){
  let converted=false;const result=await invoke({response,convert:async()=>{converted=true;return Buffer.from([255,216])}});
  assert.ok(result.status>=400);assert.equal(converted,false);assert.equal(result.body,undefined);
 }
});
test('JPEG conversion preserves aspect ratio, caps dimensions and strips metadata',async()=>{
 const bytes=await sharp({create:{width:1600,height:800,channels:3,background:'#eee'}}).withMetadata().png().toBuffer();
 const output=await jpeg(bytes),meta=await sharp(output).metadata();
 assert.equal(meta.format,'jpeg');assert.equal(meta.width,1280);assert.equal(meta.height,640);assert.equal(meta.exif,undefined);assert.ok(output.length<4*1024*1024);
 await assert.rejects(()=>jpeg(Buffer.from('not an image')));
});
