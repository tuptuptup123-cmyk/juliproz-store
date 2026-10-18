'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),seo=require('./seo.cjs'),config=require('../config.js'),reader=require('../catalog-reader.js'),taxonomy=require('../catalog-taxonomy.js'),pricing=require('../product-pricing.js');
const fields='id,created_at,available,brand,name,category,size,price,currency,image_url,photos,description,fulfillment_status,reserved,product_condition,stock_quantities,original_price';
const {escape:e}=seo;
const homeBuyer=require('../home-buyer.js'),discovery=require('../discovery-pages.js'),saleCollections=require('../sale-collections.js');
function render(template,kind,slug,lang,rows=[],selection={}){
 const page={...seo.page(kind,slug),kind},en=lang==='en',filtered=kind==='brand'?rows.filter(p=>taxonomy.brandParts(p.brand).includes(page.brand)):kind==='catalog'&&selection.sale?rows.filter(p=>saleCollections.matches(p,selection.saleCollection)):rows;
 const schemas=[seo.organization(),{'@context':'https://schema.org','@type':kind==='catalog'||kind==='brand'?'CollectionPage':'WebPage',name:page.heading[lang],description:page.description[lang],url:seo.url(page.path,lang),inLanguage:lang,isPartOf:{'@id':seo.origin+'/#website'}}];
 if(kind==='home')schemas.push({'@context':'https://schema.org','@type':'WebSite','@id':seo.origin+'/#website',name:'JULI.PROZ',url:seo.origin+'/',inLanguage:['ru','en'],publisher:{'@id':seo.origin+'/#organization'}});
 if(kind!=='home')schemas.push({'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'JULI.PROZ',item:seo.url('/',lang)},{'@type':'ListItem',position:2,name:page.heading[lang],item:seo.url(page.path,lang)}]});
 if(filtered.length)schemas.push({'@context':'https://schema.org','@type':'ItemList',itemListElement:filtered.map((p,i)=>({'@type':'ListItem',position:i+1,url:seo.url('/product/'+p.id,lang)}))});
 const cards=filtered.map(p=>{const title=seo.translate([p.brand,p.name].filter(Boolean).join(' — '),lang),amount=pricing.amount(p.price,p.currency);return `<li><a href="${seo.url('/product/'+p.id,lang)}">${e(title)}</a><p>${e(seo.translate(p.size||'',lang))}${amount===null?'':` · ${e(amount)} €`}</p></li>`}).join('');
 const extra=kind==='home'?`<img class="seo-home-photo" src="/images/home-boutique.jpg" alt="${en?'Julia with a Hermès bag':'Юля с сумкой Hermès'}" width="1080" height="1620">${homeBuyer.render(lang,'server-')}`:'';
 const editorial=kind==='outlet'?discovery.outlet(lang,'server-'):kind==='brand'?discovery.brand(slug,lang,'server-'):'';
 const intro=kind==='catalog'&&selection.sale?'':editorial||`<h1>${e(page.heading[lang])}</h1><p>${e(page.intro[lang])}</p>`;
 const body=`<article id="serverLanding" class="seo-landing" data-no-translate>${seo.nav(lang)}<nav class="seo-languages" aria-label="${en?'Language':'Язык'}"><a href="${seo.url(page.path,'ru')}" lang="ru">RU</a><a href="${seo.url(page.path,'en')}" lang="en">EN</a></nav>${intro}${extra}${cards?`<ul class="seo-product-list">${cards}</ul>`:''}<a class="seo-contact" href="${en?'https://wa.me/message/LX6SBE3QCQXKG1':'https://t.me/juliproz'}">${en?'Contact our team':'Связаться с менеджером'}</a>${seo.brandLinks(lang)}</article>`;
 return seo.decorate(template,page,lang,schemas).replace(/<body[^>]*>/i,m=>m+body);
}
function createHandler({request=fetch,readTemplate=()=>fs.readFile(path.join(__dirname,'../index.html'),'utf8')}={}){return async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Type','text/html; charset=utf-8');
 if(!['GET','HEAD'].includes(req.method)){res.statusCode=405;return res.end()}
 const input=new URL(req.url,seo.origin),kind=input.searchParams.get('page')||'home',slug=input.searchParams.get('slug'),lang=seo.language(input.searchParams.get('lang'));
 if(!seo.page(kind,slug)||['page','slug','lang'].some(key=>input.searchParams.getAll(key).length>1)){res.statusCode=404;res.setHeader('X-Robots-Tag','noindex');return res.end('Not found')}
 try{const rows=['brand','catalog'].includes(kind)?await reader.read({url:config.url,key:config.key,fields,fetch:request,signal:AbortSignal.timeout(12000)}):[];const html=render(await readTemplate(),kind,slug,lang,rows,saleCollections.fromSearch(input.search));res.statusCode=200;return res.end(req.method==='HEAD'?undefined:html)}catch{res.statusCode=503;res.setHeader('Retry-After','30');res.end('Catalogue temporarily unavailable')}
}}
module.exports={createHandler,render};
