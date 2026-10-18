/* Local presentation layer: never translate identifiers, form values or catalogue data. */
(function(root){
 'use strict';
 const copy=root.SiteTranslations||{ui:{},products:{}},key='jpWebsiteLanguageV1';
 const categories={'Аксессуары':'Accessories','Ароматические свечи':'Scented candles','Благовония':'Incense','Брюки':'Trousers','Головной убор':'Hats','Джинсы':'Jeans','Духи':'Fragrances','Жилеты':'Vests','Зип-худи':'Zip hoodies','Кардиганы':'Cardigans','Костюмы':'Suits & sets','Купальники':'Swimwear','Куртки':'Jackets','Леггинсы':'Leggings','Лонгсливы':'Long-sleeve tops','Майки':'Tank tops','Обувь':'Shoes','Очки':'Eyewear','Перчатки':'Gloves','Поло':'Polo shirts','Рубашки':'Shirts','Свитеры':'Knitwear','Свитшоты':'Sweatshirts','Спортивная одежда':'Activewear','Сумки':'Bags','Техника':'Electronics','Украшения':'Jewellery','Футболки':'T-shirts','Худи':'Hoodies','Часы':'Watches','Шорты':'Shorts'};
 const labels={'размер':'size','размеры':'sizes','цвет':'colour','цвета':'colours','длина':'length','Длина':'Length','Цвет':'Colour','Цвета':'Colours','уточнить':'please confirm','уточняйте':'please ask','Состояние':'Condition','Доставка':'Delivery','Срок доставки':'Delivery time','Статус':'Availability','Артикул':'Reference','Открыть':'View','Размер / вариант':'Size / option','Выбран цвет':'Selected colour','на брони':'reserved','нет в наличии':'out of stock','Вес':'Weight','Высота':'Height','Ширина':'Width','Верх':'Top','низ':'bottom','см':'cm','г':'g'};
 const normal=s=>String(s??'').replace(/\s+/g,' ').trim();
 let language='ru',preferred='ru',observer=null;
 const fragments={...copy.products,...copy.ui,...categories,...labels};
 const fragmentKeys=Object.keys(fragments).sort((a,b)=>b.length-a.length);
 const nodes=new WeakMap(),attrs=new WeakMap();
 function telegram(){
  if(root.document?.documentElement?.dataset?.storefront==='telegram')return true;
  const app=root.Telegram?.WebApp,hash=new URLSearchParams(root.location?.hash?.slice(1)||'');
  return Boolean(app&&((typeof app.initData==='string'&&app.initData.length)||(app.platform&&app.platform!=='unknown'))||hash.get('tgWebAppData')||hash.get('tgWebAppVersion')||(hash.get('tgWebAppPlatform')&&hash.get('tgWebAppPlatform')!=='unknown'));
 }
 function english(input){
  const raw=String(input??''),s=normal(raw);
  if(!s)return raw;
  const exact=copy.ui[s]??copy.products[s]??categories[s]??labels[s];
  if(exact!==undefined)return raw.replace(raw.trim(),exact);
  if(raw.includes('\n'))return raw.split('\n').map(english).join('\n');
  let match;
  if((match=s.match(/^В каталоге (\d+) товар(?:а|ов)?$/)))return `${match[1]} ${match[1]==='1'?'piece':'pieces'} in the collection`;
  if((match=s.match(/^(\d+) (?:вещь|вещи|вещей)$/)))return `${match[1]} ${match[1]==='1'?'item':'items'}`;
  if((match=s.match(/^В наличии · (\d+) шт\.$/)))return `In stock · ${match[1]} available`;
  if((match=s.match(/^Фото (\d+)$/)))return `Photo ${match[1]}`;
  if(s==='Привет! Хочу заказать:')return 'Hello! I would like to order:';
  if(s==='Здравствуйте! Хочу уточнить по этой вещи:')return 'Hello! I would like to ask about this piece:';
  if((match=s.match(/^Выберите (размер|цвет|длина)( перед покупкой)?$/)))return `Choose a ${english(match[1])}${match[2]?' before adding to your bag':''}`;
  if((match=s.match(/^Пожалуйста, выберите (размер|цвет|длина)\.$/)))return `Please select a ${english(match[1])}.`;
  if((match=s.match(/^Выбран (размер|цвет|длина) (.+)$/)))return `Selected ${english(match[1])}: ${english(match[2])}`;
  if((match=s.match(/^Код для запроса удаления ранее отправленной статистики: (.+)\. Сохраните его перед закрытием страницы и передайте менеджеру\.$/)))return `Analytics deletion reference: ${match[1]}. Save it before closing this page and send it to our team.`;
  if((match=s.match(/^Сортировка товаров: (.+)$/)))return `Sort products: ${english(match[1])}`;
  if((match=s.match(/^(Показать товары|Виш-лист) · (\d+)$/)))return `${english(match[1])} · ${match[2]}`;
  if((match=s.match(/^(Срок доставки|Доставка)[: ]+(.+)$/)))return `${english(match[1])}: ${english(match[2])}`;
  if((match=s.match(/^(Размер|Размеры|Цвет|Цвета|Длина|Выбран цвет|Состояние|Статус|Артикул|Количество|Размер \/ вариант):\s*(.+)$/)))return `${english(match[1])}: ${english(match[2])}`;
  if((match=s.match(/^(Ремни|Мячи|Головные уборы|Косметички): (.+)$/)))return `${({'Ремни':'Belts','Мячи':'Balls','Головные уборы':'Hats','Косметички':'Toiletry bags'})[match[1]]}: ${match[2].replace(/ см$/, ' cm')}`;
  if(s.includes(' · '))return s.split(' · ').map(english).join(' · ');
  // Product model names and sizes remain verbatim; only known Russian copy is replaced.
  let result=raw;
  result=result.replace('Здравствуйте! Меня интересует ', 'Hello! I am interested in ');
  for(const source of fragmentKeys){
   if(!/[А-Яа-яЁё]/.test(source)||!result.includes(source))continue;
   const escaped=source.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   result=result.replace(new RegExp('(?<![А-Яа-яЁё])'+escaped+'(?![А-Яа-яЁё])','g'),()=>fragments[source]);
  }
  return result;
 }
 function text(value){return language==='en'?english(value):String(value??'')}
 // The phone destination is resolved from the owner's WhatsApp Business short link.
 // Number-based click-to-chat links preserve the product/order draft.
 function managerLink(message='',options={}){
  const whatsapp=!options.inTelegram&&!telegram()&&(options.language||language)==='en';
  const url=whatsapp?(message?'https://wa.me/971585394347':'https://wa.me/message/LX6SBE3QCQXKG1'):'https://t.me/juliproz';
  return url+(message?'?text='+encodeURIComponent(whatsapp?english(message):String(message)):'');
 }
 function rememberText(node){
  const current=node.nodeValue,old=nodes.get(node),source=old&&old.result===current?old.source:current,result=text(source);
  nodes.set(node,{source,result});if(current!==result)node.nodeValue=result;
 }
 const attributes=['aria-label','title','placeholder','alt'];
 function element(el){
  if(el.matches('script,style,noscript,textarea,[data-no-translate]')||el.closest('[data-no-translate]'))return;
  if(el.matches('a[data-manager-link]'))el.setAttribute('href',managerLink());
  if(el.matches('[data-manager-handle]')){const label=language==='en'?'WhatsApp':'@juliproz';if(el.textContent!==label)el.textContent=label;}
  if(el.matches('[data-manager-platform]'))el.toggleAttribute('hidden',el.dataset.managerPlatform!==(language==='en'?'whatsapp':'telegram'));
  const saved=attrs.get(el)||{};
  for(const name of attributes){
   if(!el.hasAttribute(name))continue;
   const current=el.getAttribute(name),old=saved[name],source=old&&old.result===current?old.source:current,result=text(source);
   saved[name]={source,result};if(current!==result)el.setAttribute(name,result);
  }
  attrs.set(el,saved);
  if(el.matches('a[data-language-link]')){
   const url=new URL(el.getAttribute('href'),root.location.href);url.searchParams.set('lang',language);el.setAttribute('href',url.pathname+url.search);
  }
 }
 function visit(node){
  if(node.nodeType===3){if(!node.parentElement?.closest('script,style,noscript,textarea,[data-no-translate]'))rememberText(node);return}
  if(node.nodeType!==1&&node.nodeType!==9)return;
  if(node.nodeType===1){if(node.matches('script,style,noscript,textarea,[data-no-translate]'))return;element(node)}
  for(const child of node.childNodes)visit(child);
 }
 function watch(){observer?.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:attributes})}
 function apply(target=document.documentElement){observer?.disconnect();visit(target);watch()}
 function controls(){
  const isBot=telegram();document.documentElement.dataset.storePlatform=isBot?'telegram':'website';document.documentElement.lang=language;
  for(const group of document.querySelectorAll('.language-switch')){group.hidden=isBot;group.setAttribute('aria-label',language==='en'?'Website language':'Язык сайта');for(const button of group.querySelectorAll('[data-site-language]'))button.setAttribute('aria-pressed',String(button.dataset.siteLanguage===language))}
 }
 function sync(){const next=telegram()?'ru':preferred,changed=next!==language;language=next;controls();if(changed)apply();return changed}
 function set(value){
  if(!['ru','en'].includes(value)||telegram())return;
  preferred=value;try{localStorage.setItem(key,value)}catch{}
  try{const url=new URL(root.location.href);if(value==='en')url.searchParams.set('lang','en');else url.searchParams.delete('lang');root.history.replaceState(root.history.state,'',url)}catch{}
  sync();apply();document.dispatchEvent(new CustomEvent('site-language-change',{detail:{language}}));
 }
 function start(){
  try{const query=new URLSearchParams(root.location.search).get('lang'),stored=localStorage.getItem(key),server=document.documentElement.dataset.seoLanguage;preferred=['ru','en'].includes(query)?query:['ru','en'].includes(server)?server:stored==='en'?'en':'ru'}catch{preferred=new URLSearchParams(root.location.search).get('lang')==='en'?'en':'ru'}
  sync();apply();
  observer=new MutationObserver(records=>{
   observer.disconnect();const targets=new Set(records.map(r=>r.type==='childList'?r.target:r.target));
   for(const target of targets)if(target.isConnected)visit(target);
   watch();
  });watch();
  document.addEventListener('click',event=>{const button=event.target.closest('[data-site-language]');if(button)set(button.dataset.siteLanguage)});
  document.addEventListener('load',event=>{if(event.target.id==='telegramSdk')sync()},true);
  root.addEventListener('storage',event=>{if(event.key===key){preferred=event.newValue==='en'?'en':'ru';sync();apply()}});
 }
 root.SiteLanguage={text,english,managerLink,set,sync,apply,get language(){return language},isTelegram:telegram};
 if(typeof module==='object'&&module.exports)module.exports=root.SiteLanguage;
 if(typeof document!=='undefined')start();
})(typeof window==='object'?window:globalThis);
