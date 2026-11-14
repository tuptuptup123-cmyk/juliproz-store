'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),template=fs.readFileSync(path.join(root,'index.html'),'utf8'),site=require('../server/site-page.cjs');
for(const lang of ['ru','en'])test('homepage uses native stylesheet loading and retains image/font preloads: '+lang,()=>{
 const html=site.render(template,'home',null,lang,[]),head=html.split('</head>')[0];
 assert.doesNotMatch(head,/data-storefront-deferred|media="print"|src="\/storefront-styles.js"|id="homeCriticalStyles"/);
 const styles=head.match(/<link\b[^>]*rel="stylesheet"[^>]*>/g)||[];
 assert.equal(styles.length,8);
 for(const tag of styles)assert.doesNotMatch(tag,/\bmedia=|\bonload=/);
 for(const name of ['boutique','lifestyle'])assert.match(head,new RegExp('<link rel="preload" as="image" fetchpriority="high" href="/images/home-'+name+'-'));
 assert.equal((head.match(/rel="preload" as="font"/g)||[]).length,2);
 assert.doesNotMatch(head,/undefined/);
});
test('catalog retains its native stylesheet loading',()=>{
 const html=site.render(template,'catalog',null,'ru',[]);
 assert.doesNotMatch(html,/data-storefront-deferred|src="\/storefront-styles.js"/);
 assert.equal((html.split('</head>')[0].match(/<link\b[^>]*rel="stylesheet"[^>]*>/g)||[]).length,8);
});
