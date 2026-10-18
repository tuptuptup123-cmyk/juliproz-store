(function(root){
 'use strict';
 if(!root.SeoContent||document.documentElement.dataset.storefront==='telegram')return;
 const content=root.SeoContent,discovery=root.DiscoveryPages,escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const serverRendered=Boolean(document.getElementById('seoPageData'));
 let data;try{data=JSON.parse(document.getElementById('seoPageData')?.textContent||'null')}catch{}
 data=data||{...content.pages.home,kind:'home'};
 const initialPage=data,initialLanguage=document.documentElement.dataset.seoLanguage||content.language(new URLSearchParams(location.search).get('lang'));
 const initialSchemas=[...document.querySelectorAll('script[type="application/ld+json"]')].flatMap(el=>{try{return [JSON.parse(el.textContent)]}catch{return []}});
 function language(){return root.SiteLanguage?.language||content.language(new URLSearchParams(location.search).get('lang'))}
 function schemas(lang){
  if(data.path===initialPage.path&&lang===initialLanguage)return initialSchemas;
  const url=content.url(data.path,lang),name=data.heading?.[lang]||data.title[lang].replace(/ \| JULI\.PROZ$/,'');
  const breadcrumb={'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'JULI.PROZ',item:content.url('/',lang)},{'@type':'ListItem',position:2,name,item:url}]};
  if(data.kind==='product'){
   const product=initialSchemas.find(schema=>schema['@type']==='Product');
   if(!product)return [breadcrumb];
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
  const values={'meta[name="description"]':data.description[lang],'meta[property="og:title"]':data.title[lang],'meta[property="og:description"]':data.description[lang],'meta[property="og:url"]':content.url(data.path,lang),'meta[property="og:type"]':data.kind==='product'?'product':'website','meta[property="og:image"]':data.image||content.origin+'/images/brand-paw.webp','meta[name="twitter:title"]':data.title[lang],'meta[name="twitter:description"]':data.description[lang]};
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
  for(const key of ['product','tab','page','slug'])url.searchParams.delete(key);
  if(tab!=='catalog')for(const key of ['sale','collection'])url.searchParams.delete(key);
  if(['favorites','cart','about'].includes(tab))url.searchParams.set('tab',tab);
  const next=url.pathname+url.search,current=location.pathname+location.search+location.hash;
  if(next!==current)history[replace?'replaceState':'pushState']({tab},'',next);
 }
 function setHTML(el,key,html){if(el&&el.dataset.renderKey!==key){el.innerHTML=html;el.dataset.renderKey=key}}
 function sync(state){
  const lang=language(),inCatalog=['catalog','hermes'].includes(state.tab);
  if(serverRendered&&state.tab==='catalog'&&data.kind==='catalog'){
   const url=new URL(location.href);url.searchParams.delete('sale');url.searchParams.delete('collection');
   if(state.sale){url.searchParams.set('sale','1');if(window.SaleCollections?.groups[state.saleCollection])url.searchParams.set('collection',state.saleCollection)}
   const next=url.pathname+url.search+url.hash;if(next!==location.pathname+location.search+location.hash)history.replaceState(history.state,'',next);
  }
  if(inCatalog&&data.kind==='brand'&&state.brand!==data.brand){data={...content.pages.catalog,kind:'catalog'};updateURL('catalog',true);metadata()}
  const intro=document.getElementById('seoCatalogIntro'),show=inCatalog&&data.kind!=='product';
  if(intro){
   intro.hidden=!show;
   if(show){
    const page=data.kind==='brand'?data:content.pages.catalog,slug=page.path.split('/')[2],rich=data.kind==='brand'&&discovery?.definitions[slug];
    intro.classList.toggle('discovery-intro',Boolean(rich));
    const sale=!rich&&state.sale?root.SaleCollections?.copy(lang,state.saleCollection):null;
    const html=rich?discovery.brand(slug,lang):`<h1>${escape(sale?.heading||page.heading[lang])}</h1><p>${escape(sale?.intro||page.intro[lang])}</p>${sale?`<a class="discovery-text-link" href="${root.SaleCollections.url(lang)}">${lang==='en'?'All SALE pieces':'Все вещи SALE'} →</a>`:''}`;
    setHTML(intro,lang+'|'+page.path+'|'+Boolean(sale)+'|'+(state.saleCollection||''),html);
   }
  }
  const outlet=document.getElementById('webOutletPage');if(outlet&&state.tab==='outlet')setHTML(outlet,lang,discovery.outlet(lang));
 }
 function navigate(tab,options={}){
  const next=tab==='hermes'?{...content.page('brand','hermes'),kind:'brand'}:content.pages[tab]?{...content.pages[tab],kind:tab}:['favorites','cart','about'].includes(tab)?{...content.pages.home,kind:'home'}:null;
  if(!next)return;data=next;updateURL(tab,Boolean(options.replace));metadata();
 }
 function restore(){
  const path=location.pathname.replace(/\/$/,'')||'/',slug=/^\/brands\/([^/]+)$/.exec(path)?.[1],kind=slug?'brand':Object.keys(content.pages).find(key=>content.pages[key].path===path)||'home';
  data=initialPage.kind==='product'&&initialPage.path===path?{...initialPage}:{...(content.page(kind,slug)||content.pages.home),kind};metadata();return data;
 }
 function ready(){document.getElementById('serverLanding')?.remove();document.documentElement.removeAttribute('data-server-view')}
 root.SiteSEO={sync,navigate,restore,ready,get page(){return data}};
 metadata();document.addEventListener('site-language-change',metadata);
})(window);
