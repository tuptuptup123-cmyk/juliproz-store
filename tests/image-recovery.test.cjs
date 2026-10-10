const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
function setup(src,area=true){
 const statuses=[],parent={querySelector:()=>statuses[0],appendChild:s=>{s.remove=()=>statuses.splice(0);statuses.push(s)}};
 const img={tagName:'IMG',hidden:false,parentElement:parent,src,getAttribute:()=>img.src,closest:()=>area?parent:null};
 const listeners={},context=vm.createContext({WeakMap,URL,Date,location:{href:'https://juliproz-store.vercel.app/'},safeProductImage:s=>typeof s==='string'&&s.startsWith('https://juliproz-store.vercel.app/images/'),document:{addEventListener:(type,handler)=>listeners[type]=handler,createElement:()=>({setAttribute(){}})}});
 vm.runInContext(source.slice(source.indexOf('const productImageAttempts'),source.indexOf('function refreshCatalogOnReturn')),context);
 return {img,statuses,error:()=>listeners.error({target:img}),load:()=>listeners.load({target:img})};
}
test('gallery image retries a transient failure once and clears failure status on successful load',()=>{
 const f=setup('https://juliproz-store.vercel.app/images/jeans.png');f.error();assert.match(f.img.src,/jp_retry=/);assert.equal(f.statuses.length,0);
 const retry=f.img.src;f.error();assert.equal(f.img.src,retry);assert.equal(f.img.hidden,true);assert.equal(f.statuses[0].textContent,'Фото не загрузилось');f.error();assert.equal(f.statuses.length,1);f.load();assert.equal(f.img.hidden,false);assert.equal(f.statuses.length,0);
 f.img.src='https://juliproz-store.vercel.app/images/back.png';f.error();assert.match(f.img.src,/back.png\?jp_retry=/);
});
test('untrusted images are never retried and unrelated images are not modified',()=>{
 const unsafe=setup('https://untrusted.example/file.png');unsafe.error();assert.equal(unsafe.img.src,'https://untrusted.example/file.png');assert.equal(unsafe.img.hidden,true);
 const unrelated=setup('https://juliproz-store.vercel.app/images/logo.png',false);unrelated.error();assert.equal(unrelated.img.hidden,false);assert.equal(unrelated.statuses.length,0);
});
