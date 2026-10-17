const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function language(){const context={URLSearchParams,URL};context.window=context;vm.createContext(context);for(const file of ['site-translations.js','product-translations.js','site-language.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);return context}
test('English order drafts retain line breaks, product URLs, sizes and quantities',()=>{
 const {SiteLanguage:l}=language();
 assert.equal(l.english('Привет! Хочу заказать:\n\nhttps://www.juliproz.com/product/99001?lang=en\nРазмер: 40 · Количество: 2'),'Hello! I would like to order:\n\nhttps://www.juliproz.com/product/99001?lang=en\nSize: 40 · Quantity: 2');
 assert.equal(l.english('Красный, размер S, на брони'),'Red, size S, reserved');
 assert.equal(l.english('Состояние: Небольшие следы носки'),'Condition: Minor signs of wear');
});
test('Reviewed product copy stays text and covers complete names and descriptions',()=>{
 const {SiteTranslations:copy,SiteLanguage:l}=language();assert.ok(Object.keys(copy.products).length>=345);
 for(const [ru,en] of Object.entries(copy.products)){assert.doesNotMatch(en,/[А-Яа-яЁё]/);assert.equal(l.english(ru),en)}
 assert.equal(l.english('Hermès <script>alert(1)</script>'),'Hermès <script>alert(1)</script>','Translation never interprets user or catalogue text as HTML');
});
test('English sharing uses an English website URL but Telegram always keeps its bot link',()=>{
 const sharing=require('../product-sharing.js');const product={id:99001,brand:'Gucci',name:'Sneakers',available:true};
 const web=sharing.links(product,{language:'en',size:'40'});assert.equal(web.url,'https://www.juliproz.com/product/99001?lang=en');assert.match(new URL(web.manager).searchParams.get('text'),/^Hello!/);assert.match(new URL(web.telegram).searchParams.get('text'),/Size \/ option: 40/);
 const bot=sharing.links(product,{language:'en',inTelegram:true,size:'40'});assert.equal(bot.url,'https://t.me/JuliProzBot/shop?startapp=p_99001');assert.match(new URL(bot.manager).searchParams.get('text'),/^Здравствуйте!/);assert.doesNotMatch(bot.url,/lang=/);
});

test('English share drafts translate colour variants without changing the canonical product link',()=>{
 const c=language();vm.runInContext(fs.readFileSync(path.join(__dirname,'..','product-sharing.js'),'utf8'),c);
 const product={id:45,brand:'Gucci',name:'Кроссовки',available:true};
 const en=c.ProductSharing.links(product,{language:'en',size:'Розовый'});
 assert.match(new URL(en.manager).searchParams.get('text'),/Size \/ option: Pink/);
 assert.doesNotMatch(new URL(en.manager).searchParams.get('text'),/[А-Яа-яЁё]/);
 const bot=c.ProductSharing.links(product,{inTelegram:true,language:'en',size:'Розовый'});
 assert.match(new URL(bot.manager).searchParams.get('text'),/Размер \/ вариант: Розовый/);
});


test('manager destination follows website language and never overrides a Telegram launch',()=>{
 const c=language(),draft='Привет! Хочу заказать:\n\nhttps://www.juliproz.com/product/45&lang=en\nРазмер: S · Количество: 2';
 assert.equal(c.SiteLanguage.managerLink('',{language:'en'}),'https://wa.me/message/LX6SBE3QCQXKG1');
 const link=new URL(c.SiteLanguage.managerLink(draft,{language:'en'}));assert.equal(link.origin+link.pathname,'https://wa.me/971585394347');assert.match(link.searchParams.get('text'),/Size: S · Quantity: 2/);assert.doesNotMatch(link.searchParams.get('text'),/[А-Яа-яЁё]/);
 assert.equal(new URL(c.SiteLanguage.managerLink(draft,{language:'ru'})).hostname,'t.me');
 assert.equal(new URL(c.SiteLanguage.managerLink(draft,{language:'en',inTelegram:true})).hostname,'t.me');
 for(const launch of [{Telegram:{WebApp:{platform:'ios'}}},{location:{hash:'#tgWebAppPlatform=ios'}},{document:{documentElement:{dataset:{storefront:'telegram'}}}}]){
  Object.assign(c,launch);assert.equal(new URL(c.SiteLanguage.managerLink(draft,{language:'en'})).hostname,'t.me');delete c.Telegram;delete c.location;delete c.document;
 }
 vm.runInContext(fs.readFileSync(path.join(__dirname,'..','product-sharing.js'),'utf8'),c);
 const shared=c.ProductSharing.links({id:45,brand:'Gucci',name:'Кроссовки'},{language:'en',size:'Розовый'});assert.equal(new URL(shared.manager).hostname,'wa.me');assert.match(new URL(shared.manager).searchParams.get('text'),/Size \/ option: Pink/);
 assert.equal(new URL(c.ProductSharing.links({id:45},{language:'en',inTelegram:true}).manager).hostname,'t.me');
});
