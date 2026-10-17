const {test}=require('node:test'),assert=require('node:assert/strict');
const sharing=require('../product-sharing.js');
test('share links contain only the public product identity and encoded description',()=>{
 const data=sharing.links({id:397,brand:'Loro Piana',name:'Кепка & <script>',available:true,price:500,internal_note:'PRIVATE NOTE',location:'PRIVATE LOCATION',custodian:'PRIVATE CONTACT',access_token:'PRIVATE TOKEN'},{size:'XL'});
 assert.equal(data.web,'https://www.juliproz.com/product/397');
 assert.equal(data.bot,'https://t.me/JuliProzBot/shop?startapp=p_397');
 assert.equal(data.url,data.web);assert.equal(new URL(data.telegram).searchParams.get('url'),data.web);
 assert.match(new URL(data.telegram).searchParams.get('text'),/Размер \/ вариант: XL/);
 assert.match(new URL(data.manager).searchParams.get('text'),/product\/397/);
 assert.doesNotMatch(JSON.stringify(data),/PRIVATE|access_token|internal_note|500/);
});
test('Telegram context keeps copied, forwarded and manager links inside the bot',()=>{
 const data=sharing.links({id:301,available:true},{inTelegram:true,size:'XXL'});
 assert.equal(data.url,data.bot);assert.equal(new URL(data.telegram).searchParams.get('url'),data.bot);
 assert.ok(new URL(data.manager).searchParams.get('text').endsWith(data.bot));
});
test('share links reject drafts, unavailable products and URL injection',()=>{
 for(const id of [undefined,null,0,-1,'','1&token=private','javascript:alert(1)','../admin.html'])assert.equal(sharing.links({id,available:true}),null);
 assert.equal(sharing.links({id:1,available:false}),null);
 assert.equal(sharing.links({id:1,reserved:true,available:true}).web,'https://www.juliproz.com/product/1');
 assert.ok(sharing.links({id:'6ee10a72-4423-4988-9e92-c7c8d3141091'}));
});
