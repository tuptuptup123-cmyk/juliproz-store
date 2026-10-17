const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('each contact button records its purpose once, with product context only where available',async()=>{
 const nodes=new Map(),events=[],links=[],services=['authentication','atelier'].map(service=>({dataset:{service}}));
 const get=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',classList:{add(){},remove(){},toggle(){},contains(){return false}},addEventListener(n,fn){this[n]=fn},setAttribute(){}});return nodes.get(id)};
 const c=vm.createContext({ProductSizes:require('../product-sizes.js'),safeProductImage:()=>false,publicProductImage:v=>v,window:{STORE_CONFIG:{url:'https://test.invalid',key:'public'},StoreAnalytics:{track:(...e)=>events.push(e)},open:u=>links.push(u),addEventListener(){}},document:{visibilityState:'visible',getElementById:get,querySelectorAll:s=>s==='[data-service]'?services:[],querySelector:()=>null,addEventListener(){}},localStorage:{getItem:()=>null,setItem(){}},location:{search:''},URL,URLSearchParams,AbortSignal,setTimeout,fetch:async()=>({ok:true,json:async()=>[{id:7,name:'Product',available:true}]})});
 vm.runInContext(fs.readFileSync(__dirname+'/../catalog-reader.js','utf8'),c);c.CatalogReader=c.window.CatalogReader;
 vm.runInContext(fs.readFileSync(__dirname+'/../product-pricing.js','utf8'),c);vm.runInContext(fs.readFileSync(__dirname+'/../app.js','utf8'),c);const run=s=>vm.runInContext(s,c);await new Promise(setImmediate);
 services[0].onclick();services[0].onclick();assert.equal(events.filter(e=>e[0]==='manager_authentication').length,1);
 run('managerOpenTimes.clear()');services[1].onclick();run('managerOpenTimes.clear()');get('offerItem').onclick();
 run('managerOpenTimes.clear()');await run('contact(null,"manager_search_product",7)');
 run('managerOpenTimes.clear()');await run('contact({id:7,name:"Product"})');
 run('managerOpenTimes.clear()');await run('contact()');
 assert.deepEqual(events.filter(e=>e[0].startsWith('manager_')).map(e=>e[0]),['manager_authentication','manager_atelier','manager_sell','manager_search_product','manager_product','manager_general']);
 assert.deepEqual(events.find(e=>e[0]==='manager_search_product'),['manager_search_product',7]);
 assert.deepEqual(events.find(e=>e[0]==='manager_product'),['manager_product',7]);
 assert.match(new URL(links.find(url=>new URL(url).searchParams.get('text')?.includes('Артикул: 7'))).searchParams.get('text'),/https:\/\/www\.juliproz\.com\/product\/7$/);
 for(const platform of ['website','telegram'])for(const language of ['ru','en']){
  run(`window.Telegram=${platform==='telegram'?'{WebApp:{platform:"ios"}}':'undefined'};window.SiteLanguage={language:${JSON.stringify(language)}}`);
  assert.equal(run('productLink({id:7})'),platform==='telegram'?'https://t.me/JuliProzBot/shop?startapp=p_7':'https://www.juliproz.com/product/7'+(language==='en'?'?lang=en':''));
 }

});
