const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const legal=require('../server/legal-page.cjs');
test('legal pages have complete server translations and reversible source copy',()=>{
 for(const kind of ['terms','privacy'])for(const lang of ['ru','en']){
  const template=fs.readFileSync(path.join(__dirname,'..',kind+'.html'),'utf8'),html=legal.render(template,kind,lang);
  assert.match(html,new RegExp('<html lang="'+lang+'"'));assert.doesNotMatch(html,/data-server-view/);
  const canonical='https://www.juliproz.com/'+kind+'.html'+(lang==='en'?'?lang=en':'');
  assert.ok(html.includes('<link rel="canonical" href="'+canonical+'">'));
  assert.match(html,/hreflang="ru"/);assert.match(html,/hreflang="en"/);assert.match(html,/name="description"/);
  const body=html.split('<body')[1].replace(/<div class="language-switch"[\s\S]*?<\/div>/,'').replace(/<[^>]+>/g,'');
  if(lang==='en'){assert.doesNotMatch(body,/[А-Яа-яЁё]/);assert.match(html,/https:\/\/wa.me\/message\/LX6SBE3QCQXKG1/);assert.ok(JSON.parse(html.match(/id="localizedPageSources" type="application\/json">([^<]*)/)[1]).length>10)}
  else assert.match(body,/Конфиденциальность|Условия покупки/);
 }
});
test('legal handler rejects unknown pages and duplicate language parameters',async()=>{
 const handler=legal.createHandler({readTemplate:()=>{throw Error('Should not read')}});
 for(const url of ['/api/legal-page?page=../../config','/api/legal-page?page=terms&lang=en&lang=ru']){
  const res={setHeader(){},end(){}};await handler({url,method:'GET'},res);assert.equal(res.statusCode,404);
 }
});
