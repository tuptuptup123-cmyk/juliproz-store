const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('each contact button records its purpose once, with product context only where available',async()=>{
 const nodes=new Map(),events=[],services=['authentication','atelier'].map(service=>({dataset:{service}}));
 const get=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',classList:{add(){},remove(){},toggle(){},contains(){return false}},addEventListener(n,fn){this[n]=fn},setAttribute(){}});return nodes.get(id)};
 const c=vm.createContext({ProductSizes:require('../product-sizes.js'),safeProductImage:()=>false,window:{STORE_CONFIG:{url:'https://test.invalid',key:'public'},StoreAnalytics:{track:(...e)=>events.push(e)},open(){},addEventListener(){}},document:{visibilityState:'visible',getElementById:get,querySelectorAll:s=>s==='[data-service]'?services:[],querySelector:()=>null,addEventListener(){}},localStorage:{getItem:()=>null,setItem(){}},location:{search:''},URLSearchParams,AbortSignal,setTimeout,fetch:async()=>({ok:true,json:async()=>[{id:7,name:'Product',available:true}]})});
 vm.runInContext(fs.readFileSync(__dirname+'/../product-pricing.js','utf8'),c);vm.runInContext(fs.readFileSync(__dirname+'/../app.js','utf8'),c);const run=s=>vm.runInContext(s,c);await new Promise(setImmediate);
 services[0].onclick();services[0].onclick();assert.equal(events.filter(e=>e[0]==='manager_authentication').length,1);
 run('telegramOpenTimes.clear()');services[1].onclick();run('telegramOpenTimes.clear()');get('offerItem').onclick();
 run('telegramOpenTimes.clear()');await run('contact(null,"manager_search_product",7)');
 run('telegramOpenTimes.clear()');await run('contact({id:7,name:"Product"})');
 run('telegramOpenTimes.clear()');await run('contact()');
 assert.deepEqual(events.filter(e=>e[0].startsWith('manager_')).map(e=>e[0]),['manager_authentication','manager_atelier','manager_sell','manager_search_product','manager_product','manager_general']);
 assert.deepEqual(events.find(e=>e[0]==='manager_search_product'),['manager_search_product',7]);
 assert.deepEqual(events.find(e=>e[0]==='manager_product'),['manager_product',7]);
});
