const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),site=require('../server/site-page.cjs'),seo=require('../seo-content.js');
const template=fs.readFileSync('index.html','utf8');
for(const lang of ['ru','en'])test('jewellery SSR has localized metadata and only jewellery: '+lang,()=>{
 const h=site.render(template,'jewellery',null,lang,[{id:501,brand:'Cartier',name:'Love',category:'Украшения',price:3000,currency:'EUR'},{id:502,brand:'Rolex',name:'Watch',category:'Часы',price:12000,currency:'EUR'}]);
 const landing=h.match(/<article id="serverLanding"[\s\S]*?<\/article>/)[0];
 assert.ok(h.includes('rel="canonical" href="'+seo.url('/jewellery',lang)+'"'));assert.ok(h.includes('hreflang="en" href="https://www.juliproz.com/jewellery?lang=en"'));
 assert.equal((landing.match(/<h1\b/g)||[]).length,1);assert.ok(landing.includes('/product/501'));assert.ok(!landing.includes('/product/502'));
 const schemas=[...h.matchAll(/<script type="application\/ld\+json">([^<]+)<\/script>/g)].map(m=>JSON.parse(m[1]));assert.ok(schemas.some(s=>s['@type']==='CollectionPage'));assert.deepEqual(schemas.find(s=>s['@type']==='ItemList').itemListElement.map(x=>x.url),[seo.url('/product/501',lang)]);
});
test('existing editorial pages have distinct titles, language URLs and image references',()=>{
 const titles=new Set();for(const [kind,slug] of [['brand','hermes'],['brand','chanel'],['brand','loro-piana'],['watches'],['jewellery'],['outlet']])for(const lang of ['ru','en']){
 const page=seo.page(kind,slug),h=site.render(template,kind,slug,lang,[]);assert.ok(!titles.has(page.title[lang]));titles.add(page.title[lang]);assert.ok(h.includes('rel="canonical" href="'+seo.url(page.path,lang)+'"'));assert.ok(h.includes('hreflang="ru"'));assert.ok(h.includes('hreflang="en"'));
 }
 const images=require('../discovery-pages.js').editorialImages;assert.equal(Object.values(images).flat().length,14);for(const [path,photos] of Object.entries(images)){assert.ok(path.startsWith('/'));for(const src of photos)assert.match(src,/^\/images\/editorial\/[a-z-]+\.webp$/)}
});
