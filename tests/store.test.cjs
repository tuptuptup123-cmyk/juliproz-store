const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
function element(){return {innerHTML:'',textContent:'',value:'',disabled:false,dataset:{},children:[],files:[],classList:{add(){},remove(){},toggle(){}},addEventListener(){},scrollIntoView(){},reset(){}}}
function setup(file,fetch,query=''){
 const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)};
 const document={getElementById:get,querySelectorAll:()=>[],querySelector:()=>element(),addEventListener(){}};
 const links=[];const window={STORE_CONFIG:{url:'https://test.supabase.co',key:'publishable'},Telegram:{WebApp:{ready(){},expand(){},openTelegramLink:u=>links.push(u),initDataUnsafe:{}}}};
 const context=vm.createContext({document,window,Telegram:window.Telegram,fetch,console:{...console,error(){}},URL,URLSearchParams,atob,AbortSignal,AbortController,setTimeout,clearTimeout,structuredClone,Intl,Set,Number,String,Array,JSON,Date,crypto:{randomUUID:crypto.randomUUID},location:{search:query},navigator:{clipboard:{writeText:async u=>links.push(u)}},localStorage:{getItem:()=>'{broken',setItem(){throw Error('storage denied')}}});
 vm.runInContext(fs.readFileSync(`${__dirname}/../image-policy.js`,'utf8'),context);
 vm.runInContext(fs.readFileSync(`${__dirname}/../${file}`,'utf8'),context);
 return {context,get,links,run:s=>vm.runInContext(s,context)};
}
const response=(body,status=200)=>({ok:status<400,status,json:async()=>body});
(async()=>{
 const product={id:'6ee10a72-4423-4988-9e92-c7c8d3141091',brand:'CHANEL',name:'Балетки <script>',size:'38',price:1700,currency:'€',category:'Обувь',available:true,image_url:'https://juliproz-store.vercel.app/images/a.jpg',photos:['https://juliproz-store.vercel.app/images/b.jpg','javascript:alert(1)']};
 const app=setup('app.js',async()=>response([product]),`?startapp=p_${product.id}`);
 await new Promise(setImmediate);
 assert.match(app.get('productContent').innerHTML,/Балетки &lt;script&gt;/);
 assert.equal(app.run('selectedProduct.id'),product.id);
 assert.equal(app.run('photosOf(selectedProduct).length'),2);
 assert.match(app.run('money(selectedProduct)'),/^€ /);
 await app.run('contact(selectedProduct)');
 const draft=new URL(app.links[0]);assert.equal(draft.pathname,'/juliproz');assert.match(draft.searchParams.get('text'),/Артикул: 6ee10/);assert.match(draft.searchParams.get('text'),/startapp=p_/);assert.doesNotMatch(draft.searchParams.get('text'),/[€$£₽]|1700|1[\s\u00a0\u202f]700/);
 app.run('state.search="38"');assert.equal(app.run('filtered().length'),1);
 app.get('grid').onclick({target:{closest:s=>s==='[data-heart]'?{dataset:{heart:product.id}}:null},stopPropagation(){}});
 app.run('state.tab="favorites"');assert.equal(app.run('filtered().length'),1);
 assert.match(app.get("productContent").innerHTML,/data-action="contact">Купить<\/button>/);assert.doesNotMatch(app.get("productContent").innerHTML,/data-action="share"/);
 const missing=setup('app.js',async()=>response([]),'?product=999');await new Promise(setImmediate);assert.match(missing.get('productContent').innerHTML,/снят с наличия/);
 let attempts=0;const retry=setup('app.js',async()=>response(attempts++?[]:{},attempts===1?503:200));await new Promise(setImmediate);assert.match(retry.get('grid').innerHTML,/retryProducts/);await retry.run('loadProducts()');assert.match(retry.get('grid').innerHTML,/Здесь пока ничего нет/);
 const pages=[];const paginated=setup('app.js',async url=>{pages.push(url);return response(pages.length===1?Array.from({length:500},(_,i)=>({...product,id:i})):[])});await new Promise(setImmediate);assert.equal(pages.length,2);assert.match(pages[1],/offset=500/);assert.equal(paginated.run('products.length'),500);
 console.log('PASS catalog links, UUIDs, safe rendering, photo filtering, manager draft, favorites, unavailable links, retries and pagination');
 const calls=[];let inventory=[];const admin=setup('admin.js',async(path,options)=>{calls.push({path,options});if(path.includes('grant_type=password'))return response({access_token:'admin-token',expires_at:Date.now()/1000+3600,user:{id:'owner'}});if(path.includes('store_admins'))return response([{user_id:'owner'}]);if(path.endsWith('/auth/v1/user'))return response({id:'owner',factors:[]});if(options.method==='POST'&&path.includes('/rest/v1/products')){const p=JSON.parse(options.body);inventory=[{...p,id:10,revision:1}];return response(inventory)}if(options.method==='PATCH'){Object.assign(inventory[0],JSON.parse(options.body));inventory[0].revision++;return response(inventory)}if(path.includes('creation_key=eq.'))return response([]);return response(inventory)});
 const fields=Object.fromEntries(['brand','name','category','size','price','currency','description','available'].map(n=>[n,element()]));admin.get('editor').elements=fields;
 await admin.get('login').onsubmit({preventDefault(){},submitter:element(),target:{email:{value:'owner@example.com'},password:{value:'test'}}});
 admin.run('edit(null)');Object.assign(fields.brand,{value:'CHANEL'});Object.assign(fields.name,{value:'Балетки'});Object.assign(fields.category,{value:'Обувь'});fields.price.value='1700';fields.currency.value='EUR';fields.available.checked=true;admin.run('photos=["https://juliproz-store.vercel.app/images/a.jpg"]');
 await admin.get('editor').onsubmit({preventDefault(){},target:{elements:fields}});
 assert.equal(inventory.length,1);assert.equal(inventory[0].available,true);assert.equal(inventory[0].photos.length,1);assert.match(admin.get('status').textContent,/сохранён/);
 await admin.get('inventory').onclick({target:{dataset:{toggle:'10'},disabled:false}});assert.equal(inventory[0].available,false);
 assert.ok(calls.filter(c=>c.options.method==='POST'||c.options.method==='PATCH').filter(c=>c.path.includes('/products')).every(c=>c.options.headers.Authorization==='Bearer admin-token'));
 const denied=setup('admin.js',async path=>response(path.includes('grant_type=password')?{access_token:'user',expires_at:Date.now()/1000+3600,user:{id:'outsider'}}:[]));await denied.get('login').onsubmit({preventDefault(){},submitter:element(),target:{email:{value:'no@example.com'},password:{value:'test'}}});assert.match(denied.get('status').textContent,/нет доступа/);assert.equal(denied.run('session'),null);
 let writes=0;
 const conflict=setup('admin.js',async(path,options)=>{if(options.method==='PATCH'){writes++;return response([])}return response([])});
 conflict.run("session={access_token:'admin',expires_at:Date.now()/1000+3600,user:{id:'owner'}};items=[{id:10,revision:1,available:true}]");
 await conflict.get('inventory').onclick({target:{dataset:{toggle:'10'},disabled:false}});
 assert.equal(writes,1);assert.match(conflict.get('status').textContent,/Карточка изменилась/);
 let refreshes=0;
 const refresh=setup('admin.js',async(path)=>{if(path.includes('refresh_token')){refreshes++;await new Promise(setImmediate);return response({access_token:'fresh',expires_in:3600,user:{id:'owner'}})}return response([])});
 refresh.run("session={access_token:'expired',refresh_token:'refresh',expires_at:0,user:{id:'owner'}}");
 await refresh.run("Promise.all([request('/rest/v1/products'),request('/rest/v1/products')])");assert.equal(refreshes,1);
 refresh.run('endSession()');await assert.rejects(refresh.run("request('/rest/v1/products')"),/Сессия завершена/);
 console.log('PASS admin allowlist, authenticated writes, concurrent refresh, expired session denial and zero-row update rejection');
})().catch(e=>{console.error(e);process.exitCode=1});

