'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {destination}=require('../manager-contact.js');
test('manager handoff preserves the entire draft and only accepts the configured contacts',()=>{
 const message='Здравствуйте! Hermès & Loro Piana\nРазмер: XL · 2 вещи\nhttps://t.me/JuliProzBot/shop?startapp=p_501';
 const data=destination('https://t.me/juliproz?text='+encodeURIComponent(message));
 assert.equal(data.message,message);assert.equal(data.telegram,true);
 assert.equal(destination('https://wa.me/971585394347?text=Hello').telegram,false);
 assert.ok(destination('https://wa.me/message/LX6SBE3QCQXKG1'));
 for(const url of ['javascript:alert(1)','https://t.me/another_person','https://t.me/juliproz?start=share_501','https://t.me.evil.test/juliproz','https://evil.test/?text=Hello','https://user:pass@t.me/juliproz','https://t.me:444/juliproz','https://t.me/juliproz#private','http://t.me/juliproz','https://wa.me/123'])assert.equal(destination(url),null,url);
});
