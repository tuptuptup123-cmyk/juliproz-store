'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),seo=require('./seo.cjs');
const pages={
 terms:{kind:'legal',path:'/terms.html',title:{ru:'Условия покупки — JULI.PROZ',en:'Purchase terms — JULI.PROZ'},description:{ru:'Условия покупки JULI.PROZ: согласование заказа, оплата, доставка, отмена, возврат и обмен.',en:'JULI.PROZ purchase terms: confirming your order, payment, delivery, cancellations, returns and exchanges.'}},
 privacy:{kind:'legal',path:'/privacy.html',title:{ru:'Конфиденциальность — JULI.PROZ',en:'Privacy — JULI.PROZ'},description:{ru:'Как JULI.PROZ использует локальное хранение, статистику с согласия посетителя и техническую диагностику; как запросить удаление данных.',en:'How JULI.PROZ uses local storage, consent-based analytics and technical diagnostics, and how to request data deletion.'}}
};
function render(template,kind,lang){
 const page=pages[kind];if(!page)throw Error('Unknown legal page');
 const sources=[];
 // These are fixed, trusted project templates. Never translate scripts or styles.
 if(lang==='en')template=template.split(/(<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<[^>]+>)/gi).map(part=>{
  if(part.startsWith('<'))return part.replace(/(aria-label|title|alt)="([^"]*)"/g,(_,attr,value)=>{const translated=seo.translate(value,lang);if(translated!==value)sources.push([translated,value]);return attr+'="'+seo.escape(translated)+'"'});
  const translated=seo.translate(part,lang);if(translated!==part)sources.push([translated,part]);return translated;
 }).join('').replace(/(data-manager-link[^>]*href=|href=)"https:\/\/t.me\/juliproz"/g,'$1"https://wa.me/message/LX6SBE3QCQXKG1"');
 const scripts='<script id="localizedPageSources" type="application/json">'+seo.json(sources)+'</script><script defer src="/seo-content.js"></script><script defer src="/site-seo.js"></script>';
 // Plain links allow switching languages even when JavaScript is disabled.
 template=template.replace('</main>',`<noscript><nav aria-label="Language"><a href="${page.path}">RU</a> · <a href="${page.path}?lang=en">EN</a></nav></noscript></main>`).replace('</head>',scripts+'</head>');
 const schema={'@context':'https://schema.org','@type':'WebPage',name:page.title[lang],description:page.description[lang],url:seo.url(page.path,lang),inLanguage:lang};
 return seo.decorate(template,page,lang,[schema]).replace(/ data-server-view="[^"]+"/,'');
}
function createHandler({readTemplate=kind=>fs.readFile(path.join(__dirname,'..',kind+'.html'),'utf8')}={}){return async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');
 if(!['GET','HEAD'].includes(req.method)){res.statusCode=405;return res.end()}
 const url=new URL(req.url,seo.origin),kind=url.searchParams.get('page'),lang=seo.language(url.searchParams.get('lang'));
 if(!Object.hasOwn(pages,kind)||['page','lang'].some(k=>url.searchParams.getAll(k).length>1)){res.statusCode=404;return res.end('Not found')}
 try{const html=render(await readTemplate(kind),kind,lang);require('./public-response.cjs')(req,res,html,{staticPage:true})}catch{res.statusCode=503;res.end('Page temporarily unavailable')}
}}
module.exports={createHandler,render,pages};
