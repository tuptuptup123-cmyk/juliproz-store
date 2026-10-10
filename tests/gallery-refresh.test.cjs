const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
function setup({old=['cover','source'],fresh=['cover'],shown='source',hidden=false}={}){
 const gallery={innerHTML:'old markup',querySelector:()=>({getAttribute:()=>shown})},modal={scrollTop:237,classList:{contains:()=>hidden}};
 const context=vm.createContext({selectedProduct:{id:153,name:'Bomber',image_url:old[0],photos:old},products:[{id:153,name:'Bomber',image_url:fresh[0],photos:fresh}],selectedSize:'XL',cart:[{id:153,quantity:2}],document:{getElementById:()=>modal,querySelector:()=>gallery},photosOf:p=>[...new Set([p.image_url,...p.photos])],esc:s=>s});
 vm.runInContext(source.slice(source.indexOf('function syncOpenProductGallery'),source.indexOf('function openProduct(')),context);
 return {context,gallery,modal,run:()=>vm.runInContext('syncOpenProductGallery()',context)};
}
test('open modal updates old two-shot gallery to one without reload, preserving size/cart/scroll',()=>{
 const f=setup();f.run();assert.deepEqual(Array.from(f.context.selectedProduct.photos),['cover']);assert.match(f.gallery.innerHTML,/src="cover"/);assert.doesNotMatch(f.gallery.innerHTML,/photo-picker|source/);assert.equal(f.context.selectedSize,'XL');assert.equal(f.context.cart[0].quantity,2);assert.equal(f.modal.scrollTop,237);
});
test('keeps selected detail if retained and adds newly published model shot',()=>{
 const f=setup({old:['cover','back'],fresh:['cover','model','back'],shown:'back'});f.run();assert.match(f.gallery.innerHTML,/class="hero"><img src="back"/);assert.equal((f.gallery.innerHTML.match(/data-photo=/g)||[]).length,3);
});
test('closed modal and unchanged gallery are not rewritten',()=>{
 const closed=setup({hidden:true});closed.run();assert.equal(closed.gallery.innerHTML,'old markup');
 const same=setup({old:['cover'],fresh:['cover']});same.run();assert.equal(same.gallery.innerHTML,'old markup');
});
test('catalogue refresh syncs the open gallery, with visible-only minute refresh',()=>{
 assert.match(source,/if\(changed\)syncOpenProductGallery\(\)/);
 assert.match(source,/window.setInterval\?\.\(\(\)=>\{if\(document.visibilityState==='visible'\)refreshCatalogOnReturn\(\)\},60000\)/);
 assert.match(source,/Date.now\(\)-lastCatalogLoadedAt>=60000/);
});
