const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function codec(window={}){vm.runInNewContext(fs.readFileSync(__dirname+'/../photo-codec.js','utf8'),{window});return window.PhotoCodec}
test('mobile encoding falls back to transparent PNG for null, unsupported or throwing WebP encoders',async()=>{
 for(const mode of ['null','wrong','throw']){const calls=[],canvas={toBlob(cb,type){calls.push(type);if(type==='image/webp'){if(mode==='throw')throw Error();cb(mode==='wrong'?{type:'image/jpeg'}:null)}else cb({type:'image/png'})}};assert.equal((await codec().encode(canvas)).type,'image/png');assert.deepEqual(calls,['image/webp','image/png'])}
 await assert.rejects(codec().encode({toBlob:cb=>cb(null)}),/подготовить фото/);
});
test('mobile image decoding uses an HTML image when createImageBitmap is unavailable and revokes its URL',async()=>{
 const revoked=[],window={URL:{createObjectURL:()=> 'blob:synthetic',revokeObjectURL:u=>revoked.push(u)},Image:class{naturalWidth=100;naturalHeight=80;set src(v){this.width=100;this.height=80;queueMicrotask(()=>this.onload())}}};const image=await codec(window).decode({});assert.equal(image.width,100);image.close();assert.deepEqual(revoked,['blob:synthetic']);
});
