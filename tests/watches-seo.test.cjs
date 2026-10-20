const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const site=require('../server/site-page.cjs'),seo=require('../seo-content.js');
const template=fs.readFileSync('index.html','utf8');
for(const lang of ['ru','en'])test('watch landing renders localized SEO and only watch products: '+lang,()=>{
 const html=site.render(template,'watches',null,lang,[{id:501,brand:'Rolex',name:'Datejust',category:'Часы',price:12000,currency:'EUR'},{id:502,brand:'Chanel',name:'Bag',category:'Сумки',price:4000,currency:'EUR'}]);
 assert.ok(html.includes('rel="canonical" href="'+seo.url('/watches',lang)+'"'));
 assert.ok(html.includes('hreflang="en" href="https://www.juliproz.com/watches?lang=en"'));
 assert.ok(html.includes('hreflang="ru" href="https://www.juliproz.com/watches"'));
 const landing=html.match(/<article id="serverLanding"[\s\S]*?<\/article>/)[0];
 assert.ok(landing.includes(lang==='en'?'Luxury watches':'Люксовые часы'));
 assert.ok(landing.includes('/product/501'));assert.ok(!landing.includes('/product/502'));
 assert.equal((landing.match(/<h1\b/g)||[]).length,1);
 const schemas=[...html.matchAll(/<script type="application\/ld\+json">([^<]+)<\/script>/g)].map(m=>JSON.parse(m[1]));
 assert.ok(schemas.some(s=>s['@type']==='CollectionPage'));
 assert.deepEqual(schemas.find(s=>s['@type']==='ItemList').itemListElement.map(x=>x.url),[seo.url('/product/501',lang)]);
});
