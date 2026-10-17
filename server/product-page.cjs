'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),config=require('../config.js'),pricing=require('../product-pricing.js'),sizes=require('../product-sizes.js');
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const origin='https://www.juliproz.com',fields='id,brand,name,description,category,size,price,currency,image_url,photos,available,reserved,fulfillment_status,product_condition,stock_quantities';
function photo(value){try{const u=new URL(value,'https://juliproz-store.vercel.app');if(u.username||u.password||u.search||u.hash)return null;if(u.origin==='https://juliproz-store.vercel.app'&&u.pathname.startsWith('/images/'))return u.href;if(u.origin===config.url&&/^\/(storage\/v1\/object\/public\/product-photos|functions\/v1\/product-photo)\//.test(u.pathname))return u.href.replace('/storage/v1/object/public/product-photos/','/functions/v1/product-photo/')}catch{}return null}
function render(template,p){
 const canonical=origin+'/product/'+p.id,title=[p.brand,p.name].filter(Boolean).join(' — ').slice(0,240),description=(p.description||[title,p.size].filter(Boolean).join(' · ')).slice(0,500);
 const images=[...new Set([p.image_url,...(Array.isArray(p.photos)?p.photos:[])].map(photo).filter(Boolean))].slice(0,8),price=pricing.amount(p.price,p.currency);
 const available=p.reserved?'OutOfStock':p.fulfillment_status==='on_order'?'PreOrder':sizes.stockUnits(p)>0?'InStock':'OutOfStock';
 const schema={'@context':'https://schema.org','@type':'Product',name:title,sku:String(p.id),url:canonical,description,brand:{'@type':'Brand',name:p.brand},...(images.length?{image:images}:{}),itemCondition:p.product_condition==='new'||!p.product_condition?'https://schema.org/NewCondition':'https://schema.org/UsedCondition'};
 // No fabricated price, ratings or reference numbers. Price-on-request has no Offer.
 if(price!==null)schema.offers={'@type':'Offer',url:canonical,price,priceCurrency:'EUR',availability:'https://schema.org/'+available,seller:{'@type':'Organization',name:'JULI.PROZ'}};
 const meta=`<title>${escape(title)} | JULI.PROZ</title><meta name="description" content="${escape(description)}"><link rel="canonical" href="${canonical}"><meta property="og:type" content="product"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${canonical}">${images[0]?`<meta property="og:image" content="${escape(images[0])}">`:''}<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(title)}">${images[0]?`<meta name="twitter:image" content="${escape(images[0])}">`:''}<script type="application/ld+json">${JSON.stringify(schema).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029')}</script>`;
 let html=template.replace(/<title>[\s\S]*?<\/title>/i,'').replace(/<meta\b[^>]*(?:name="(?:description|twitter:[^"]+)"|property="og:[^"]+")[^>]*>/gi,'').replace(/<link\b[^>]*rel="canonical"[^>]*>/gi,'').replace('</head>',meta+'</head>');
 html=html.replace(/(src|href)="(?![a-z]+:|\/|#)([^\"]+)"/gi,'$1="/$2"');
 const status=p.reserved?'На брони':p.fulfillment_status==='on_order'?'Под заказ':available==='InStock'?'В наличии':'Нет в наличии';
 const article=`<article id="serverProduct" class="server-product"><a href="/">JULI.PROZ · каталог</a><h1>${escape(title)}</h1>${images[0]?`<img src="${escape(images[0])}" alt="${escape(title)}" width="640" height="640">`:''}<p>${escape(description)}</p><p>${escape(p.size||'')}</p><p>${price===null?'Цена по запросу':escape(price)+' €'} · ${status}</p><a href="https://t.me/juliproz?text=${encodeURIComponent('Здравствуйте! Меня интересует '+title+' '+canonical)}">Уточнить у менеджера</a></article>`;
 return html.replace(/<body[^>]*>/i,m=>m+article);
}
function createHandler({request=fetch,readTemplate=()=>fs.readFile(path.join(__dirname,'../index.html'),'utf8')}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(!['GET','HEAD'].includes(req.method)){res.statusCode=405;return res.end()}
  const input=new URL(req.url,origin),id=input.searchParams.get('id');if(!/^[1-9]\d{0,17}$/.test(id||'')||input.searchParams.getAll('id').length!==1){res.statusCode=404;return res.end('Not found')}
  try{
   const r=await request(config.url+'/rest/v1/products?select='+fields+'&id=eq.'+id+'&available=eq.true&limit=1',{headers:{apikey:config.key},redirect:'error',signal:AbortSignal.timeout(8000)});
   if(!r.ok)throw Error();const rows=await r.json();if(!Array.isArray(rows))throw Error();const p=rows[0];
   if(!p||p.available!==true){res.statusCode=404;res.setHeader('X-Robots-Tag','noindex');return res.end('<!doctype html><html lang="ru"><meta charset="utf-8"><title>Вещь недоступна | JULI.PROZ</title><p>Этой вещи сейчас нет в каталоге.</p><a href="/">Открыть магазин</a></html>')}
   const html=render(await readTemplate(),p).replace('name="jp-release" content="development"','name="jp-release" content="'+(/^[a-f0-9]{40}$/.test(process.env.VERCEL_GIT_COMMIT_SHA||'')?process.env.VERCEL_GIT_COMMIT_SHA:'development')+'"');
   res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(req.method==='HEAD'?undefined:html);
  }catch{res.statusCode=503;res.setHeader('Retry-After','30');return res.end('Catalogue temporarily unavailable')}
 };
}
module.exports={render,createHandler,photo};
