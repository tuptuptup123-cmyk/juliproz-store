'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),template=fs.readFileSync(path.join(root,'index.html'),'utf8'),site=require('../server/site-page.cjs');
test('homepage exposes responsive LCP requests early and defers complete UI styles',()=>{
 const html=site.render(template,'home',null,'ru',[]),head=html.split('</head>')[0];
 assert.equal((head.match(/data-storefront-deferred/g)||[]).length,8);
 for(const name of ['boutique','lifestyle'])assert.match(head,new RegExp('<link rel="preload" as="image" fetchpriority="high" href="/images/home-'+name+'-'));
 assert.doesNotMatch(head,/undefined/);
 assert.match(head,/<style id="homeCriticalStyles">/);
 assert.match(head,/<noscript><link rel="stylesheet" href="\/style.css">/);
 const catalog=site.render(template,'catalog',null,'ru',[]);
 assert.doesNotMatch(catalog,/data-storefront-deferred/);
});
test('style readiness waits for every sheet and a rendering frame',async()=>{
 const listeners=[],links=Array.from({length:2},()=>({media:'print',sheet:null,addEventListener(name,fn){listeners.push({link:this,name,fn})},getAttribute(){return '/style.css'}}));
 let frame;const context={window:{},document:{querySelectorAll:()=>links},requestAnimationFrame:fn=>{frame=fn}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'storefront-styles.js'),'utf8'),context);
 const state=context.window.StorefrontStyles;
 assert.equal(state.ready,false);listeners.find(l=>l.link===links[0]&&l.name==='load').fn();await Promise.resolve();assert.equal(state.ready,false);
 listeners.find(l=>l.link===links[1]&&l.name==='load').fn();await Promise.resolve();await Promise.resolve();assert.equal(state.ready,false);frame();await state.promise;assert.equal(state.ready,true);
});
test('failed stylesheet keeps readiness false for the server fallback',async()=>{
 let fail;const context={window:{},document:{querySelectorAll:()=>[{sheet:null,addEventListener(name,fn){if(name==='error')fail=fn},getAttribute:()=>'/missing.css'}]},requestAnimationFrame:()=>{throw Error('Should not switch view')}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'storefront-styles.js'),'utf8'),context);fail();await assert.rejects(context.window.StorefrontStyles.promise);assert.equal(context.window.StorefrontStyles.ready,false);assert.equal(context.window.StorefrontStyles.failed,true);
});
