(function(root){
 'use strict';
 if(!root.SeoContent||document.documentElement.dataset.storefront==='telegram')return;
 const content=root.SeoContent,discovery=root.DiscoveryPages,escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const serverRendered=Boolean(document.getElementById('seoPageData'));
 let data;try{data=JSON.parse(document.getElementById('seoPageData')?.textContent||'null')}catch{}
 data=data||{...content.pages.home,kind:'home'};
 function language(){return root.SiteLanguage?.language||content.language(new URLSearchParams(location.search).get('lang'))}
 function links(){
  const el=document.getElementById('seoBrowseLinks');if(!el)return;const lang=language(),en=lang==='en';
  const current=path=>data.path===path?' aria-current="page"':'';
  el.innerHTML=`<div class="site-footer-identity"><a class="site-footer-wordmark" href="${content.url('/',lang)}">JULI.PROZ</a><p>${en?'Buyer service worldwide':'Buyer service по всему миру'}</p></div><div class="site-footer-section"><h2 class="site-footer-label" id="footerNavigationTitle">${en?'Explore':'Навигация'}</h2><nav class="site-footer-navigation" aria-labelledby="footerNavigationTitle">${Object.entries(content.pages).map(([key,p])=>`<a href="${content.url(p.path,lang)}"${current(p.path)}>${escape(({home:en?'Home':'Главная',catalog:en?'Collection':'Каталог',services:en?'Services':'Услуги',sell:en?'Sell your piece':'Продать вещь',outlet:'Outlet'})[key])}</a>`).join('')}</nav></div><div class="site-footer-section site-footer-brand-section"><h2 class="site-footer-label" id="footerBrandsTitle">${en?'Brands':'Бренды'}</h2><nav class="site-footer-brands" aria-labelledby="footerBrandsTitle">${content.brands.map(b=>`<a href="${content.url('/brands/'+b.slug,lang)}"${current('/brands/'+b.slug)}>${escape(b.name)}</a>`).join('')}</nav></div>`;
 }
 function metadata(){
  const lang=language();document.title=data.title[lang];
  const values={'meta[name="description"]':data.description[lang],'meta[property="og:title"]':data.title[lang],'meta[property="og:description"]':data.description[lang],'meta[property="og:url"]':content.url(data.path,lang)};
  for(const [selector,value] of Object.entries(values)){const el=document.querySelector(selector);if(el)el.setAttribute('content',value)}
  document.querySelector('link[rel="canonical"]')?.setAttribute('href',content.url(data.path,lang));
  for(const link of document.querySelectorAll('link[rel="alternate"][hreflang]'))link.setAttribute('href',content.url(data.path,link.hreflang==='en'?'en':'ru'));
  links();
 }
 function updateURL(tab,replace=false){
  if(!serverRendered)return;
  const url=new URL(location.href);url.pathname=data.path;url.hash='';
  for(const key of ['product','tab','page','slug'])url.searchParams.delete(key);
  if(['favorites','cart','about'].includes(tab))url.searchParams.set('tab',tab);
  const next=url.pathname+url.search,current=location.pathname+location.search+location.hash;
  if(next!==current)history[replace?'replaceState':'pushState']({tab},'',next);
 }
 function setHTML(el,key,html){if(el&&el.dataset.renderKey!==key){el.innerHTML=html;el.dataset.renderKey=key}}
 function sync(state){
  const lang=language(),inCatalog=['catalog','hermes'].includes(state.tab);
  if(inCatalog&&data.kind==='brand'&&state.brand!==data.brand){data={...content.pages.catalog,kind:'catalog'};updateURL('catalog',true);metadata()}
  const intro=document.getElementById('seoCatalogIntro'),show=inCatalog&&data.kind!=='product';
  if(intro){
   intro.hidden=!show;
   if(show){
    const page=data.kind==='brand'?data:content.pages.catalog,slug=page.path.split('/')[2],rich=data.kind==='brand'&&discovery?.definitions[slug];
    intro.classList.toggle('discovery-intro',Boolean(rich));
    const html=rich?discovery.brand(slug,lang):`<h1>${escape(page.heading[lang])}</h1><p>${escape(page.intro[lang])}</p>`;
    setHTML(intro,lang+'|'+page.path,html);
   }
  }
  const outlet=document.getElementById('webOutletPage');if(outlet&&state.tab==='outlet')setHTML(outlet,lang,discovery.outlet(lang));
  const browse=document.getElementById('seoBrowseLinks');if(browse)browse.hidden=!['home','catalog','services','sell','hermes','outlet'].includes(state.tab);
 }
 function navigate(tab){
  const next=tab==='hermes'?{...content.page('brand','hermes'),kind:'brand'}:content.pages[tab]?{...content.pages[tab],kind:tab}:['favorites','cart','about'].includes(tab)?{...content.pages.home,kind:'home'}:null;
  if(!next)return;data=next;updateURL(tab);metadata();
 }
 function restore(){
  const path=location.pathname.replace(/\/$/,'')||'/',slug=/^\/brands\/([^/]+)$/.exec(path)?.[1],kind=slug?'brand':Object.keys(content.pages).find(key=>content.pages[key].path===path)||'home';
  data={...(content.page(kind,slug)||content.pages.home),kind};metadata();return data;
 }
 function ready(){document.getElementById('serverLanding')?.remove();document.documentElement.removeAttribute('data-server-view')}
 root.SiteSEO={sync,navigate,restore,ready,get page(){return data}};
 metadata();document.addEventListener('site-language-change',metadata);
})(window);
