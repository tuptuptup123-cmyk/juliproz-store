'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),config=require('../config.js'),pricing=require('../product-pricing.js'),sizes=require('../product-sizes.js'),seo=require('./seo.cjs');
const {escape}=seo,origin=seo.origin,fields='id,brand,name,name_en,description_en,description,category,size,price,currency,image_url,photos,available,reserved,fulfillment_status,product_condition,stock_quantities';
const {photo}=require('./public-product-image.cjs');
function render(template,p,lang='ru'){
 lang=seo.language(lang);const route='/product/'+p.id,canonical=seo.url(route,lang),titles={},descriptions={};
 for(const language of ['ru','en']){titles[language]=[p.brand,seo.productCopy(p,'name',language)].filter(Boolean).join(' — ').slice(0,240);descriptions[language]=(seo.productCopy(p,'description',language)||[titles[language],seo.translate(p.size,language)].filter(Boolean).join(' · ')).slice(0,500)}
 const title=titles[lang],description=descriptions[lang],images=[...new Set([p.image_url,...(Array.isArray(p.photos)?p.photos:[])].map(photo).filter(Boolean))].slice(0,8),price=pricing.amount(p.price,p.currency);
 const available=p.reserved?'OutOfStock':p.fulfillment_status==='on_order'?'PreOrder':sizes.stockUnits(p)>0?'InStock':'OutOfStock';
 const schema={'@context':'https://schema.org','@type':'Product',name:title,sku:String(p.id),url:canonical,description,brand:{'@type':'Brand',name:p.brand},...(images.length?{image:images}:{}),itemCondition:p.product_condition==='new'||!p.product_condition?'https://schema.org/NewCondition':'https://schema.org/UsedCondition'};
 // No fabricated price, ratings or reference numbers. Price-on-request has no Offer.
 if(price!==null)schema.offers={'@type':'Offer',url:canonical,price,priceCurrency:'EUR',availability:'https://schema.org/'+available,seller:{'@type':'Organization',name:'JULI.PROZ'}};
 const breadcrumb={'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'JULI.PROZ',item:seo.url('/',lang)},{'@type':'ListItem',position:2,name:lang==='en'?'Collection':'Каталог',item:seo.url('/catalog',lang)},{'@type':'ListItem',position:3,name:title,item:canonical}]};
 // A shared condition note such as 'new, full set' must not become an identical snippet for every model.
 const summaries=Object.fromEntries(['ru','en'].map(language=>[language,[...new Set([titles[language],descriptions[language],seo.translate(p.size||'',language)].filter(Boolean))].join(' · ').slice(0,320)]));
 const page={kind:'product',path:route,title:{ru:titles.ru+' | JULI.PROZ',en:titles.en+' | JULI.PROZ'},description:summaries,image:images[0]};
 const html=seo.decorate(template,page,lang,[...(price===null?[{'@context':'https://schema.org','@type':'WebPage',name:title,url:canonical,inLanguage:lang}]:[schema]),breadcrumb]);
 const status=seo.translate(p.reserved?'На брони':p.fulfillment_status==='on_order'?'Под заказ':available==='InStock'?'В наличии':'Нет в наличии',lang);
 const article=`<article id="serverProduct" class="server-product" data-no-translate>${seo.nav(lang)}<nav class="seo-languages" aria-label="${lang==='en'?'Language':'Язык'}"><a lang="ru" href="${seo.url(route,'ru')}">RU</a><a lang="en" href="${seo.url(route,'en')}">EN</a></nav><h1>${escape(title)}</h1>${images[0]?`<img src="${escape(images[0])}" alt="${escape(title)}" width="640" height="640">`:''}<p>${escape(description)}</p><p>${escape(seo.translate(p.size||'',lang))}</p><p>${price===null?(lang==='en'?'Price on request':'Цена по запросу'):escape(price)+' €'} · ${status}</p><a class="seo-contact" href="${lang==='en'?'https://wa.me/971585394347?text='+encodeURIComponent('Hello! I am interested in '+title+' '+canonical):'https://t.me/juliproz?text='+encodeURIComponent('Здравствуйте! Меня интересует '+title+' '+canonical)}">${lang==='en'?'Ask about this piece':'Уточнить у менеджера'}</a></article>`;
 return html.replace(/<body[^>]*>/i,m=>m+article);
}
function unavailable(lang){
 const title=lang==='en'?'This piece is no longer in the collection.':'Этой вещи сейчас нет в каталоге.';
 return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title} | JULI.PROZ</title><link rel="stylesheet" href="/fonts.css"><link rel="stylesheet" href="/style.css"></head><body><main class="seo-landing"><p>JULI.PROZ</p><h1>${title}</h1><p>${lang==='en'?'Browse the current collection or contact our team to find a similar piece.':'Посмотрите актуальную коллекцию или обратитесь к менеджеру для поиска похожей вещи.'}</p><a class="seo-contact" href="${seo.url('/catalog',lang)}">${lang==='en'?'Shop the collection':'Открыть магазин'}</a></main></body></html>`;
}
function createHandler({request=fetch,readTemplate=()=>fs.readFile(path.join(__dirname,'../index.html'),'utf8')}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Type','text/html; charset=utf-8');
  if(!['GET','HEAD'].includes(req.method)){res.statusCode=405;return res.end()}
  const input=new URL(req.url,origin),id=input.searchParams.get('id'),lang=seo.language(input.searchParams.get('lang'));if(!/^[1-9]\d{0,17}$/.test(id||'')||input.searchParams.getAll('id').length!==1||input.searchParams.getAll('lang').length>1){res.statusCode=404;return res.end('Not found')}
  try{
   const r=await request(config.url+'/rest/v1/products?select='+fields+'&id=eq.'+id+'&available=eq.true&limit=1',{headers:{apikey:config.key},redirect:'error',signal:AbortSignal.timeout(8000)});
   if(!r.ok)throw Error();const rows=await r.json();if(!Array.isArray(rows))throw Error();const p=rows[0];
   if(!p||p.available!==true){res.statusCode=404;res.setHeader('X-Robots-Tag','noindex');return res.end(req.method==='HEAD'?undefined:unavailable(lang))}
   const html=render(await readTemplate(),p,lang);
   return require('./public-response.cjs')(req,res,html);
  }catch{res.statusCode=503;res.setHeader('Retry-After','30');return res.end('Catalogue temporarily unavailable')}
 };
}
module.exports={render,createHandler,photo};
