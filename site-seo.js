(function(root){
 'use strict';
 if(!root.SeoContent||document.documentElement.dataset.storefront==='telegram')return;
 const content=root.SeoContent,discovery=root.DiscoveryPages,escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const serverRendered=Boolean(document.getElementById('seoPageData'));
 let data;try{data=JSON.parse(document.getElementById('seoPageData')?.textContent||'null')}catch{}
 data=data||{...content.pages.home,kind:'home'};
 const initialPage=data,initialLanguage=document.documentElement.dataset.seoLanguage||content.language(new URLSearchParams(location.search).get('lang'));
 const initialSchemas=[...document.querySelectorAll('script[type="application/ld+json"]')].flatMap(el=>{try{return [JSON.parse(el.textContent)]}catch{return []}});
 const productPages=new Map();
 if(data.kind==='product')productPages.set(data.path,{...data,productSchema:initialSchemas.find(schema=>schema['@type']==='Product')});
 function language(){return root.SiteLanguage?.language||content.language(new URLSearchParams(location.search).get('lang'))}
 function schemas(lang){
  if(data.path===initialPage.path&&lang===initialLanguage)return initialSchemas;
  const url=content.url(data.path,lang),name=data.heading?.[lang]||data.title[lang].replace(/ \| JULI\.PROZ$/,'');
  const breadcrumb={'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'JULI.PROZ',item:content.url('/',lang)},{'@type':'ListItem',position:2,name,item:url}]};
  if(data.kind==='product'){
   const product=data.productSchema||productPages.get(data.path)?.productSchema;
   if(!product||!product.offers)return [{'@context':'https://schema.org','@type':'WebPage',name,url,inLanguage:lang},breadcrumb];
   return [{...product,name,description:data.description[lang],url,...(product.offers?{offers:{...product.offers,url}}:{})},breadcrumb];
  }
  const organization={'@context':'https://schema.org','@type':'Organization','@id':content.origin+'/#organization',name:'JULI.PROZ',url:content.origin+'/',logo:content.origin+'/images/brand-paw.webp',sameAs:['https://www.instagram.com/juli.proz/','https://t.me/juli_proz','https://t.me/JuliProzBot']};
  const result=[organization,{'@context':'https://schema.org','@type':['catalog','brand'].includes(data.kind)?'CollectionPage':'WebPage',name,description:data.description[lang],url,inLanguage:lang,isPartOf:{'@id':content.origin+'/#website'}}];
  if(data.kind==='home')result.push({'@context':'https://schema.org','@type':'WebSite','@id':content.origin+'/#website',name:'JULI.PROZ',url:content.origin+'/',inLanguage:['ru','en'],publisher:{'@id':content.origin+'/#organization'}});
  else result.push(breadcrumb);
  return result;
 }
 function metadata(){
  const lang=language();document.title=data.title[lang];
  const paths={home:'/',catalog:'/catalog',hermes:'/brands/hermes',outlet:'/outlet',favorites:'/?tab=favorites',cart:'/?tab=cart',sell:'/sell',services:'/services',about:'/?tab=about'};
  for(const link of document.querySelectorAll('a[data-tab],a[data-web-section]')){
   const path=paths[link.dataset.tab||link.dataset.webSection];if(path)link.setAttribute('href',path+(lang==='en'?(path.includes('?')?'&':'?')+'lang=en':''));
  }
  const values={'meta[name="description"]':data.description[lang],'meta[property="og:title"]':data.title[lang],'meta[property="og:description"]':data.description[lang],'meta[property="og:url"]':content.url(data.path,lang),'meta[property="og:type"]':data.kind==='product'?'product':'website','meta[property="og:locale"]':lang==='en'?'en_US':'ru_RU','meta[property="og:locale:alternate"]':lang==='en'?'ru_RU':'en_US','meta[name="twitter:image"]':data.image||content.origin+'/images/brand-paw.webp','meta[property="og:image"]':data.image||content.origin+'/images/brand-paw.webp','meta[name="twitter:title"]':data.title[lang],'meta[name="twitter:description"]':data.description[lang]};
  for(const [selector,value] of Object.entries(values)){const el=document.querySelector(selector);if(el)el.setAttribute('content',value)}
  document.querySelector('link[rel="canonical"]')?.setAttribute('href',content.url(data.path,lang));
  for(const link of document.querySelectorAll('link[rel="alternate"][hreflang]'))link.setAttribute('href',content.url(data.path,link.hreflang==='en'?'en':'ru'));
  if(serverRendered){
   document.querySelectorAll('script[type="application/ld+json"]').forEach(el=>el.remove());
   for(const schema of schemas(lang)){const script=document.createElement('script');script.type='application/ld+json';script.textContent=JSON.stringify(schema);document.head.appendChild(script)}
  }
 }
 function updateURL(tab,replace=false){
  if(!serverRendered)return;
  const url=new URL(location.href);url.pathname=data.path;url.hash='';
  for(const key of ['product','tab','page','slug','size'])url.searchParams.delete(key);
  if(tab!=='catalog')for(const key of ['sale','collection'])url.searchParams.delete(key);
  if(['favorites','cart','about'].includes(tab))url.searchParams.set('tab',tab);
  const next=url.pathname+url.search,current=location.pathname+location.search+location.hash;
  if(next!==current)history[replace?'replaceState':'pushState']({tab},'',next);
 }
 function setHTML(el,key,html){if(el&&el.dataset.renderKey!==key){el.innerHTML=html;el.dataset.renderKey=key}}
 let outletRows=null;
 function sync(state,rows=null){
  if(rows!==null)outletRows=rows;
  const lang=language(),inCatalog=['catalog','hermes'].includes(state.tab);
  if(state.tab==='home')for(const img of document.querySelectorAll('img[data-home-src]')){img.src=img.dataset.homeSrc;delete img.dataset.homeSrc}
  if(serverRendered&&state.tab==='catalog'&&data.kind==='catalog'){
   const url=new URL(location.href);url.searchParams.delete('sale');url.searchParams.delete('collection');
   if(state.sale){url.searchParams.set('sale','1');if(window.SaleCollections?.groups[state.saleCollection])url.searchParams.set('collection',state.saleCollection)}
   const next=url.pathname+url.search+url.hash;if(next!==location.pathname+location.search+location.hash)history.replaceState(history.state,'',next);
  }
  if(inCatalog&&data.kind==='brand'&&state.brand!==data.brand){data={...content.pages.catalog,kind:'catalog'};updateURL('catalog',true);metadata()}
  const intro=document.getElementById('seoCatalogIntro'),show=inCatalog&&data.kind!=='product'&&!(data.kind==='catalog'&&state.sale);
  if(intro){
   intro.hidden=!show;
   if(show){
    const page=data.kind==='brand'?data:content.pages.catalog,slug=page.path.split('/')[2],rich=data.kind==='brand'&&discovery?.definitions[slug];
    intro.classList.toggle('discovery-intro',Boolean(rich));
    intro.classList.toggle('catalog-intro-compact',data.kind==='catalog');
    const html=rich?discovery.brand(slug,lang):`<h1>${escape(page.heading[lang])}</h1>${data.kind==='catalog'?'':`<p>${escape(page.intro[lang])}</p>`}`;
    setHTML(intro,lang+'|'+page.path,html);
   }
  }
  const outlet=document.getElementById('webOutletPage');if(outlet&&state.tab==='outlet'){
   const find=outletRows===null?initialPage.outletFind||null:discovery.outletFind(outletRows,root.publicProductImage);
   setHTML(outlet,lang+'|'+JSON.stringify(find),discovery.outlet(lang,'',find,true));
  }
 }
 function navigate(tab,options={}){
  const next=tab==='hermes'?{...content.page('brand','hermes'),kind:'brand'}:content.pages[tab]?{...content.pages[tab],kind:tab}:['favorites','cart','about'].includes(tab)?{...content.pages.home,kind:'home'}:null;
  if(!next)return;data=next;updateURL(tab,Boolean(options.replace));metadata();
 }
 function product(p,options={}){
  if(!serverRendered)return;
  const path='/product/'+p.id,title={},description={},translate=(s,lang)=>lang==='en'?root.SiteLanguage.english(s):String(s||'');
  for(const lang of ['ru','en']){
   const name=[p.brand,root.ProductCopy.value(p,'name',lang,s=>translate(s,lang))].filter(Boolean).join(' — ').slice(0,240),details=(root.ProductCopy.value(p,'description',lang,s=>translate(s,lang))||[name,translate(p.size,lang)].filter(Boolean).join(' · ')).slice(0,500);
   title[lang]=name+' | JULI.PROZ';description[lang]=[...new Set([name,details,translate(p.size,lang)].filter(Boolean))].join(' · ').slice(0,320);
  }
  const image=p.image_url&&root.publicProductImage?.(p.image_url),price=root.ProductPricing.amount(p.price,p.currency),lang=language(),url=content.url(path,lang);
  const availability=p.reserved?'OutOfStock':p.fulfillment_status==='on_order'?'PreOrder':root.ProductSizes.stockUnits(p)>0?'InStock':'OutOfStock';
  const productSchema={'@context':'https://schema.org','@type':'Product',name:title[lang].replace(/ \| JULI\.PROZ$/,''),sku:String(p.id),url,description:description[lang],brand:{'@type':'Brand',name:p.brand},...(image?{image:[image]}:{}),itemCondition:'https://schema.org/'+(!p.product_condition||p.product_condition==='new'?'NewCondition':'UsedCondition')};
  if(price!==null)productSchema.offers={'@type':'Offer',url,price,priceCurrency:'EUR',availability:'https://schema.org/'+availability,seller:{'@type':'Organization',name:'JULI.PROZ'}};
  const wasProduct=/^\/product\/[1-9]\d*\/?$/.test(location.pathname);
  data={kind:'product',path,title,description,image,productSchema};productPages.set(path,data);
  if(serverRendered){
   const next=new URL(content.url(path,lang));if(options.size)next.searchParams.set('size',options.size);
   const target=next.pathname+next.search;
   if(target!==location.pathname+location.search)history[wasProduct?'replaceState':'pushState']({...history.state,productReturn:wasProduct?Boolean(history.state?.productReturn):true},'',target);
  }
  metadata();
 }
 function restore(){
  const path=location.pathname.replace(/\/$/,'')||'/',slug=/^\/brands\/([^/]+)$/.exec(path)?.[1],kind=slug?'brand':Object.keys(content.pages).find(key=>content.pages[key].path===path)||'home';
  data=productPages.get(path)||{...(content.page(kind,slug)||content.pages.home),kind};metadata();return data;
 }
 function ready(){document.getElementById('serverLanding')?.remove();document.documentElement.removeAttribute('data-server-view')}
 root.SiteSEO={sync,navigate,product,restore,ready,get page(){return data},get serverRendered(){return serverRendered}};
 metadata();document.addEventListener('site-language-change',metadata);
})(window);
