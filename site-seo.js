(function(root){
 'use strict';
 if(!root.SeoContent||document.documentElement.dataset.storefront==='telegram')return;
 const content=root.SeoContent,escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const serverRendered=Boolean(document.getElementById('seoPageData'));
 let data;try{data=JSON.parse(document.getElementById('seoPageData')?.textContent||'null')}catch{}
 data=data||{...content.pages.home,kind:'home'};
 function language(){return root.SiteLanguage?.language||content.language(new URLSearchParams(location.search).get('lang'))}
 function links(){
  const el=document.getElementById('seoBrowseLinks');if(!el)return;const lang=language(),en=lang==='en';
  const current=path=>data.path===path?' aria-current="page"':'';
  el.innerHTML=`<div class="site-footer-identity"><a class="site-footer-wordmark" href="${content.url('/',lang)}">JULI.PROZ</a><p>${en?'Personal shopping.<br>Worldwide.':'Персональный байерский сервис.<br>По всему миру.'}</p></div><div class="site-footer-section"><h2 class="site-footer-label" id="footerNavigationTitle">${en?'Explore':'Навигация'}</h2><nav class="site-footer-navigation" aria-labelledby="footerNavigationTitle">${Object.entries(content.pages).map(([key,p])=>`<a href="${content.url(p.path,lang)}"${current(p.path)}>${escape(({home:en?'Home':'Главная',catalog:en?'Collection':'Каталог',services:en?'Services':'Услуги',sell:en?'Sell your piece':'Продать вещь'})[key])}</a>`).join('')}</nav></div><div class="site-footer-section site-footer-brand-section"><h2 class="site-footer-label" id="footerBrandsTitle">${en?'Brands':'Бренды'}</h2><nav class="site-footer-brands" aria-labelledby="footerBrandsTitle">${content.brands.map(b=>`<a href="${content.url('/brands/'+b.slug,lang)}"${current('/brands/'+b.slug)}>${escape(b.name)}</a>`).join('')}</nav></div>`;
 }
 function metadata(){
  const lang=language();document.title=data.title[lang];
  const values={'meta[name="description"]':data.description[lang],'meta[property="og:title"]':data.title[lang],'meta[property="og:description"]':data.description[lang],'meta[property="og:url"]':content.url(data.path,lang)};
  for(const [selector,value] of Object.entries(values)){const el=document.querySelector(selector);if(el)el.setAttribute('content',value)}
  document.querySelector('link[rel="canonical"]')?.setAttribute('href',content.url(data.path,lang));
  links();
 }
 function sync(state){
  const intro=document.getElementById('seoCatalogIntro'),show=state.tab==='catalog'&&data.kind!=='product'&&(!data.brand||state.brand===data.brand);
  if(intro){intro.hidden=!show;if(show){const page=data.kind==='brand'?data:content.pages.catalog;intro.innerHTML=`<h1>${escape(page.heading[language()])}</h1><p>${escape(page.intro[language()])}</p>`}}
  const browse=document.getElementById('seoBrowseLinks');if(browse)browse.hidden=!['home','catalog','services','sell'].includes(state.tab);
 }
 function navigate(tab){
  if(!content.pages[tab])return;
  data={...content.pages[tab],kind:tab};const url=new URL(location.href);url.pathname=data.path;url.searchParams.delete('product');url.searchParams.delete('tab');url.searchParams.delete('page');url.searchParams.delete('slug');
  if(serverRendered)history.replaceState(history.state,'',url.pathname+url.search+url.hash);metadata();
 }
 function ready(){document.getElementById('serverLanding')?.remove();document.documentElement.removeAttribute('data-server-view')}
 root.SiteSEO={sync,navigate,ready,get page(){return data}};
 metadata();document.addEventListener('site-language-change',()=>{metadata()});
})(window);
