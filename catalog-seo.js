/* Public facts only. Never infer materials, authenticity, accessories or references from photos. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CatalogSEO=api})(typeof window==='object'?window:globalThis,()=>{
 'use strict';
 const origin='https://www.juliproz.com',contentDate='2026-11-13';
 const models=[
  {slug:'rolex-daytona',brand:'Rolex',brandSlug:'rolex',name:'Rolex Cosmograph Daytona',pattern:/\bdaytona\b/i,
   intro:{ru:'Rolex Cosmograph Daytona: сравните часы по референсу, материалу корпуса, циферблату и цене. В каталоге представлены отдельные предложения; наличие и условия заказа подтверждает менеджер.',en:'Browse Rolex Cosmograph Daytona watches by reference, case material, dial and price. Each listing describes an individual offer; our team confirms availability and order details.'},
   guide:{ru:'Начните с референса Daytona или фотографии нужной версии. Уточните материал корпуса, цвет циферблата, браслет, состояние и комплект конкретных часов до оплаты.',en:'Start with a Daytona reference or a photo of your preferred version. Confirm the case material, dial colour, bracelet, condition and included accessories for the individual watch before payment.'}},
  {slug:'rolex-sky-dweller',brand:'Rolex',brandSlug:'rolex',name:'Rolex Sky-Dweller',pattern:/\bsky[- ]dweller\b/i,
   intro:{ru:'Rolex Sky-Dweller в каталоге JULI.PROZ: варианты циферблатов и браслетов Oyster и Jubilee, указанные в конкретных карточках. Сравните референсы, цены и условия заказа.',en:'Explore Rolex Sky-Dweller listings at JULI.PROZ, including the dial colours and Oyster or Jubilee bracelets stated on individual product pages. Compare references, prices and order details.'},
   guide:{ru:'Для поиска Sky-Dweller укажите референс, желаемый циферблат и браслет. Не ориентируйтесь только на общее название модели: исполнение, состояние и комплектацию подтверждаем по конкретному экземпляру.',en:'For Sky-Dweller sourcing, share the reference, preferred dial and bracelet. Confirm the exact version, condition and accessories for the individual watch rather than relying on the model name alone.'}},
  {slug:'rolex-day-date',brand:'Rolex',brandSlug:'rolex',name:'Rolex Day-Date',pattern:/\bday[- ]date\b/i,intro:{ru:'Rolex Day-Date в актуальном каталоге: фотографии, референсы, цены и поиск нужного исполнения.',en:'Explore current Rolex Day-Date listings, photos, references and prices, or request your preferred version.'},guide:{ru:'Укажите референс, диаметр, циферблат и бюджет.',en:'Share your preferred reference, diameter, dial and budget.'}},
  {slug:'hermes-birkin-25',brand:'Hermès',brandSlug:'hermes',name:'Hermès Birkin 25',pattern:/\bbirkin\s*25\b/i,
   intro:{ru:'Birkin 25 в актуальном каталоге JULI.PROZ. Сравните конкретные предложения по коже, цвету, фурнитуре и цене; наличие и итоговые условия подтвердит менеджер.',en:'Explore the current JULI.PROZ Birkin 25 selection. Compare the listed leather, colour, hardware and price of each piece; our team confirms availability and final terms.'},
   guide:{ru:'Для поиска Birkin 25 укажите желаемый цвет, кожу, фурнитуру и бюджет. Если важен конкретный комплект или состояние, сообщите об этом до согласования заказа.',en:'For a Birkin 25 sourcing request, share your preferred colour, leather, hardware and budget. Tell us before ordering if you require a particular condition or set of accessories.'}},
  {slug:'hermes-kelly-to-go',brand:'Hermès',brandSlug:'hermes',name:'Hermès Kelly To Go',pattern:/\bkelly\s*to\s*go\b/i,
   intro:{ru:'Kelly To Go в актуальном каталоге JULI.PROZ. В названиях предложений указаны доступные исполнения; откройте карточку, чтобы посмотреть фотографии, цену и условия заказа.',en:'Browse Kelly To Go pieces in the current JULI.PROZ collection. Listing names identify the offered versions; open a piece for its photos, price and order details.'},
   guide:{ru:'При выборе Kelly To Go сравните цвет, материал и фурнитуру конкретной вещи. Пришлите менеджеру ссылку на понравившееся исполнение или фото нужного варианта — обсудим поиск и доставку.',en:'Compare the colour, material and hardware of the specific Kelly To Go piece. Send our team a listing link or a photo of your preferred version to discuss sourcing and delivery.'}},
  {slug:'rolex-datejust',brand:'Rolex',brandSlug:'rolex',name:'Rolex Datejust / Lady-Datejust',pattern:/\bdatejust\b/i,
   intro:{ru:'Datejust и Lady-Datejust из каталога JULI.PROZ. Сравните диаметр корпуса, исполнение циферблата, материал, референс и цену в конкретных предложениях.',en:'Explore Datejust and Lady-Datejust listings at JULI.PROZ. Compare the stated case diameter, dial, material, reference and price of each offered watch.'},
   guide:{ru:'Для точного поиска часов пришлите референс или фотографию, желаемый диаметр, циферблат и бюджет. Состояние, год и комплект обсуждаются по конкретному экземпляру до оплаты.',en:'For precise watch sourcing, send a reference or photo, your preferred diameter, dial and budget. Condition, year and accessories are agreed for the individual watch before payment.'}}
 ];
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const text=v=>String(v??'').trim();
 function englishFact(value,translate=v=>v){
  let result=String(translate(value));
  const words={'Мягкая бархатистая телячья замша':'Soft suede calfskin','Размер каждого полотенца':'Size of each towel','серебряная':'silver-tone','золотая':'gold-tone','Рубашка':'Shirt','Шорты':'Shorts','Розовый':'Pink','Синий':'Blue','маленький':'small','Высота':'Height','Ширина':'Width','Длина':'Length','Вес':'Weight','Верх':'Top','низ':'bottom','см':'cm','г':'g','и':'and'};
  for(const [from,to] of Object.entries(words))result=result.replace(new RegExp('(?<![А-Яа-яЁё])'+from+'(?![А-Яа-яЁё])','gi'),to);
  return /[А-Яа-яЁё]/.test(result)?'':result;
 }
 function matches(model,p){return text(p.brand)===model.brand&&model.pattern.test(text(p.name))}
 function modelFor(p){return models.find(m=>matches(m,p))||null}
 function facts(p,lang='ru',translate=v=>v){
  const en=lang==='en',out=[],add=(key,label,value)=>{if(text(value))out.push({key,label,value:text(value)})};
  add('brand',en?'Brand':'Бренд',p.brand);
  const model=modelFor(p);if(model)add('model',en?'Model':'Модель',model.name.replace(model.brand+' ',''));
  add('size',en?'Size':'Размер',en?englishFact(p.size||'',translate):p.size);
  // Only explicitly labelled attributes. No substring guesses (e.g. Gold as a colour is not gold hardware).
  const source=[en?(p.name_en||p.name):p.name,en?(p.description_en||p.description):p.description].filter(Boolean).join('; ');
  for(const [key,ru,label,pattern] of [
   ['color','Цвет','Colour',/(?:^|[,;\n])\s*(?:цвет|colou?r)\s*:\s*([^,;\n]+)/i],
   ['material','Материал','Material',/(?:^|[,;\n])\s*(?:кожа|материал|leather|material)\s*:\s*([^,;\n]+)/i],
   ['hardware','Фурнитура','Hardware',/(?:^|[,;\n])\s*(?:фурнитура|hardware)\s*:\s*([^,;\n]+)/i]
  ]){const value=pattern.exec(source)?.[1]?.trim();if(value)add(key,en?label:ru,en?englishFact(value,translate):value)}
  const reference=/(?:\bref(?:erence)?\.?|референс|артикул)\s*[:№#]?\s*([A-Z0-9][A-Z0-9./-]{2,60})(?![A-Z0-9./-])/i.exec(source)?.[1];
  if(reference&&/\d/.test(reference))add('mpn',en?'Reference':'Референс',reference.replace(/[./-]+$/,''));
  const condition=p.product_condition==='new'?(en?'New':'Новое'):['pre_owned','pre-owned','used','vintage'].includes(p.product_condition)?(en?'Pre-owned':'Pre-owned'):'';
  add('condition',en?'Condition':'Состояние',condition);
  const wear={like_new:['Как новое','Like new'],gently_used:['Незначительные следы носки','Minor signs of wear'],used:['Есть следы носки','Signs of wear'],very_used:['Заметные следы носки','Visible signs of wear']};
  if(wear[p.wear_condition])add('wear',en?'Wear':'Следы носки',wear[p.wear_condition][en?1:0]);
  return out;
 }
 function factsHTML(p,lang,translate){const values=facts(p,lang,translate);return values.length?'<section class="product-specifications" data-no-translate><h2>'+(lang==='en'?'Details':'Характеристики')+'</h2><dl>'+values.map(f=>'<div><dt>'+escape(f.label)+'</dt><dd>'+escape(f.value)+'</dd></div>').join('')+'</dl></section>':''}
 function linksHTML(p,lang='ru'){
  const model=modelFor(p),brandSlug=model?.brandSlug||({'Chanel':'chanel','Hermès':'hermes','Rolex':'rolex','Chrome Hearts':'chrome-hearts','Loro Piana':'loro-piana','Gucci':'gucci','Prada':'prada','Dior':'dior','Louis Vuitton':'louis-vuitton','Bottega Veneta':'bottega-veneta','Balenciaga':'balenciaga','Maison Margiela':'maison-margiela'})[p.brand];
  const suffix=lang==='en'?'?lang=en':'';
  return '<nav class="product-collection-links" data-no-translate aria-label="'+(lang==='en'?'Explore the collection':'Смотреть коллекцию')+'">'+(brandSlug?'<a href="/brands/'+brandSlug+suffix+'">'+escape(p.brand)+'</a>':'')+(model?'<a href="/models/'+model.slug+suffix+'">'+escape(model.name)+'</a>':'')+'</nav>';
 }
 function modelLinks(brand,lang='ru',active=null){const list=models.filter(m=>!brand||m.brand===brand);if(!list.length)return '';return '<section class="popular-models" data-no-translate><h2>'+(lang==='en'?'Popular models':'Популярные модели')+'</h2><nav class="model-links" aria-label="'+(lang==='en'?'Popular models':'Популярные модели')+'">'+list.map(m=>'<a data-model="'+m.slug+'" href="/models/'+m.slug+(lang==='en'?'?lang=en':'')+'" '+(active===m.slug?'aria-current="page"':'')+'>'+escape(m.name)+'</a>').join('')+'</nav></section>'}

 function properties(p,lang='ru',translate){const f=facts(p,lang,translate),find=key=>f.find(v=>v.key===key)?.value;return {...(find('mpn')?{mpn:find('mpn')}:{}),...(find('color')?{color:find('color')}:{}),...(find('material')?{material:find('material')}:{}),...(find('size')?{size:find('size')}:{}),additionalProperty:f.filter(v=>['hardware','wear'].includes(v.key)).map(v=>({'@type':'PropertyValue',name:v.label,value:v.value}))}}
 function lastmod(value){if(!value||!/^\d{4}-\d\d-\d\d(?:T.*)?$/.test(String(value)))return null;const stamp=Date.parse(value);return Number.isFinite(stamp)&&stamp<=Date.now()?new Date(stamp).toISOString():null}
 return {origin,contentDate,models,matches,modelFor,facts,factsHTML,linksHTML,modelLinks,properties,lastmod,escape,englishFact};
});
