const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),vm=require('node:vm');
function setup(cache){
 const nodes=new Map(),listeners=new Map(),saved=new Map();if(cache!=null)saved.set('jpCatalogueV2',cache);
 const get=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',value:'',classList:{add(){},remove(){},toggle(){},contains(){return false}},addEventListener(){},setAttribute(){},focus(){}});return nodes.get(id)};
 let resolve;const pending=new Promise(r=>resolve=r);
 const window={STORE_CONFIG:{url:'https://test.invalid',key:'public'},addEventListener(){}};
 const context=vm.createContext({window,ProductSizes:require('../product-sizes.js'),safeProductImage:()=>false,document:{getElementById:get,querySelectorAll:()=>[],querySelector:()=>null,addEventListener:(name,fn)=>{listeners.set(name,[...(listeners.get(name)||[]),fn])}},sessionStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)},localStorage:{getItem:()=>null,setItem(){}},location:{search:''},URLSearchParams,AbortSignal,setTimeout,fetch:()=>pending});
 vm.runInContext(fs.readFileSync(__dirname+'/../product-pricing.js','utf8'),context);
 vm.runInContext(fs.readFileSync(__dirname+'/../app.js','utf8'),context);
 return {get,window,listeners,saved,run:s=>vm.runInContext(s,context),finish:rows=>resolve({ok:true,json:async()=>rows})};
}
const product={id:10,name:'Cached product',brand:'Brand',available:true,price:80,original_price:100,category:'Обувь'};
test('warm catalogue paints before network and a fresh response removes hidden products',async()=>{
 const app=setup(JSON.stringify({savedAt:Date.now(),products:[product]}));
 assert.match(app.get('grid').innerHTML,/Cached product/);assert.match(app.get('grid').innerHTML,/−20%/);
 assert.equal(app.run('catalogLoading'),true);
 app.finish([]);await new Promise(setImmediate);
 assert.equal(app.run('products.length'),0);assert.doesNotMatch(app.get('grid').innerHTML,/Cached product/);
 assert.equal(JSON.parse(app.saved.get('jpCatalogueV2')).products.length,0);
});
test('expired, malformed and hidden catalogue caches never appear',async()=>{
 for(const cache of ['{broken',JSON.stringify({savedAt:Date.now()-121000,products:[product]}),JSON.stringify({savedAt:Date.now(),products:[{...product,available:false}]})]){
  const app=setup(cache);assert.doesNotMatch(app.get('grid').innerHTML,/Cached product/);app.finish([]);await new Promise(setImmediate);
 }
});
test('catalogue works without Telegram SDK and a late SDK initializes once with its deep link',async()=>{
 const app=setup(null);app.finish([product]);await new Promise(setImmediate);
 assert.match(app.get('grid').innerHTML,/Cached product/);
 let ready=0,expand=0;app.window.Telegram={WebApp:{ready(){ready++},expand(){expand++},initDataUnsafe:{start_param:'p_10'}}};
 for(const fn of app.listeners.get('load'))fn({target:{id:'telegramSdk'}});
 assert.equal(app.run('selectedProduct.id'),10);assert.equal(ready,1);assert.equal(expand,1);
 app.run('initializeTelegram()');assert.equal(ready,1);
});
test('late Telegram SDK does not override user navigation',async()=>{
 const app=setup(null);app.finish([product]);await new Promise(setImmediate);app.run("setTab('cart')");
 app.window.Telegram={WebApp:{ready(){},expand(){},initDataUnsafe:{start_param:'p_10'}}};app.run('initializeTelegram()');
 assert.equal(app.run('selectedProduct'),null);assert.equal(app.run('state.tab'),'cart');
});
