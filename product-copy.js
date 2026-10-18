/* Product copy shared by the website, server and editor. No automatic claims about an item. */
(function(root){
 'use strict';
 const words={'Сумка':'Bag','Кошелёк':'Wallet','Кошелек':'Wallet','Лоферы':'Loafers','Шлёпанцы':'Slides','Шлепанцы':'Slides','Туфли':'Shoes','Босоножки':'Sandals','Сапоги':'Boots','Платье':'Dress','Юбка':'Skirt','Пиджак':'Blazer','Пальто':'Coat','Клатч':'Clutch','Картхолдер':'Cardholder','Браслет':'Bracelet','Кольцо':'Ring','Серьги':'Earrings','Колье':'Necklace','Кулон':'Pendant','Рюкзак':'Backpack','Часы':'Watch','полный комплект':'full set','новые':'new','новая':'new','новый':'new','В наличии':'In stock','Под заказ':'Available to order','Состояние':'Condition'};
 const key=s=>String(s??'').replace(/\s+/g,' ').trim(),cyrillic=s=>/[А-Яа-яЁё]/.test(s);
 function english(value){
  const raw=String(value??''),source=key(raw),dict=root.SiteTranslations?.products||{};
  if(Object.hasOwn(dict,source))return dict[source];
  let result=raw;
  for(const [from,to] of Object.entries({...words,...dict}).sort((a,b)=>b[0].length-a[0].length)){
   if(!cyrillic(from)||!result.includes(from))continue;
   const escaped=from.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   result=result.replace(new RegExp('(?<![А-Яа-яЁё])'+escaped+'(?![А-Яа-яЁё])','g'),()=>to);
  }
  return result;
 }
 // Reorder only product names. Descriptions, UI labels and reviewed *_en fields stay verbatim.
 const types=[
  ['Сумка','bag','bags?|totes?|clutches|clutch|pouches|pouch|briefcases?'],
  ['Кошелёк|Кошелек','wallet','wallets?'],['Лоферы','loafers','loafers?'],
  ['Шлёпанцы|Шлепанцы|Тапки','slides','slides?|sandals?'],['Кроссовки|Кеды','sneakers','sneakers?|trainers?'],
  ['Часы','watch','watches|watch'],['Брюки','trousers','trousers|pants'],['Джинсы','jeans','jeans|pants'],
  ['Худи','hoodie','hoodies?|hoody'],['Зип-худи','zip hoodie','hoodies?|hoody'],
  ['Шорты','shorts','shorts|trunks'],['Сандалии|Босоножки','sandals','sandals?'],
  ['Ботинки|Сапоги','boots','boots?'],['Туфли','shoes','shoes|pumps'],['Мюли','mules','mules?'],
  ['Куртка','jacket','jackets?'],['Футболка','T-shirt','t-shirts?'],['Рубашка','shirt','shirts?'],
  ['Кепка','cap','caps?'],['Рюкзак','backpack','backpacks?'],['Клатч','clutch','clutches|clutch'],
  ['Кольцо','ring','rings?'],['Браслет','bracelet','bracelets?'],['Колье','necklace','necklaces?'],
  ['Платье','dress','dresses|dress'],['Юбка','skirt','skirts?'],['Пиджак','blazer','blazers?'],
  ['Пальто','coat','coats?'],['Картхолдер','cardholder','cardholders?'],['Серьги','earrings','earrings?'],
  ['Кулон','pendant','pendants?'],['Ремень','belt','belts?'],['Кардиган','cardigan','cardigans?'],
  ['Свитер','sweater','sweaters?'],['Джемпер','jumper','jumpers?'],['Свитшот','sweatshirt','sweatshirts?']
 ];
 function nameEnglish(source,translated=english(source)){
  const type=types.find(([ru])=>new RegExp('^(?:'+ru+')(?:$|[\\s,;:])','i').test(key(source)));
  if(!type||cyrillic(translated))return translated;
  const [,noun,aliases]=type,hasType=new RegExp('\\b(?:'+aliases+')\\b','i');
  // Keep details and reference numbers after the model/type phrase.
  const split=translated.search(/[,;]|\s+(?=ref\.)/i);
  let head=(split<0?translated:translated.slice(0,split)).trim();
  const tail=split<0?'':translated.slice(split);
  const leading=new RegExp('^'+noun+'\\s+','i');
  if(leading.test(head))head=head.replace(leading,'');
  // A model can already contain its type (Sneaker, Pants, Hoody, etc.).
  const ending=new RegExp('\\s+'+noun+'$','i');
  if(ending.test(head)&&hasType.test(head.replace(ending,'')))head=head.replace(ending,'');
  if(!hasType.test(head))head+=' '+noun;
  return head+tail;
 }
 function value(p,field,language='ru',translate=english){
  if(language!=='en')return String(p?.[field]||'');
  const reviewed=String(p?.[field+'_en']||'').trim();if(reviewed)return reviewed;
  const source=p?.[field]||'',translated=translate(source);
  return field==='name'?nameEnglish(source,translated):translated;
 }
 function missing(p){return ['name','description'].filter(field=>key(p?.[field])&&cyrillic(value(p,field,'en')))}
 root.ProductCopy={english,nameEnglish,value,missing};
 if(typeof module==='object'&&module.exports)module.exports=root.ProductCopy;
})(typeof window==='object'?window:globalThis);
