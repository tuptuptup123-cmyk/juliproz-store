const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'dist');
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out);
// index.html is a server template: staging it as a static asset would shadow the home rewrite.
const files=['sale-collections.js','discovery-pages.js','discovery-pages.css','home-buyer.js','home-buyer.css','seo-content.js','site-seo.js','robots.txt','mobile-navigation.js','telegram-entry.js','privacy.html','admin-redirect.js','runtime-errors.js','fonts.css','style.css','styles.css','app.js','catalog-notice.js','site-language.js','site-translations.js','product-translations.js','config.js','image-policy.js','product-framing.js','catalog-taxonomy.js','product-sizes.js','catalog-reader.js','telegram-sdk.js','product-sharing.js','product-sharing.css','product-pricing.js','analytics.js'];
for(const name of [...files,'fonts']){const source=path.join(root,name);if(fs.existsSync(source))fs.cpSync(source,path.join(out,name),{recursive:true});}
fs.copyFileSync(path.join(root,'admin-redirect.html'),path.join(out,'admin.html'));
// Keep Google's ownership proof available for Search Console verification checks.
fs.copyFileSync(path.join(root,'googled128883bbb8c7d8d.html'),path.join(out,'googled128883bbb8c7d8d.html'));
require('./stage-images.cjs')(root,out,{privateAssets:true});
console.log('Public assets staged; internal source and SQL excluded.');

for(const file of ["index.html","admin.html"]){const target=path.join(out,file);if(fs.existsSync(target))fs.writeFileSync(target,fs.readFileSync(target,"utf8").replace('name="jp-release" content="development"','name="jp-release" content="'+(/^[a-f0-9]{40}$/.test(process.env.VERCEL_GIT_COMMIT_SHA||"")?process.env.VERCEL_GIT_COMMIT_SHA:"development")+'"'));}

// Only the WOFF2 files referenced by fonts.css are published.
for(const name of fs.readdirSync(path.join(out,"fonts"))){if(name.endsWith(".woff"))fs.rmSync(path.join(out,"fonts",name));}
