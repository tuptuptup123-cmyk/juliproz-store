// Optional isolated admin deployment; do not enable on the public store project.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'apps/admin/dist');
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
for(const name of ['site-translations.js','product-translations.js','product-copy.js','admin-google-search.js','admin-google-search.css','admin.html','admin.css','admin-editor-sections.js','admin-health.js','admin-transport.js','admin.js','product-quality.js','admin-manager.css','admin-manager.js','admin-images.js','admin-step-up.js','business-date.js','admin-session.js','admin-selects.js','admin-workspace.js','admin-sales.js','admin-schedule.js','admin-business.js','admin-business.css','admin-finance.js','admin-product-finance.js','admin-finance.css','analytics-report.js','runtime-errors.js','fonts.css','config.js','image-policy.js','product-framing.js','catalog-taxonomy.js','product-sizes.js','manager-contact.js','manager-contact.css','product-sharing.js','product-sharing.css','product-pricing.js','photo-codec.js','photo-studio.js','photo-background.js','photo-worker.js','fonts','vendor']){const source=path.join(root,name);fs.cpSync(source,path.join(out,name),{recursive:true})}
// Only public, content-addressed assets receive long-lived browser caching.
// HTML and all authenticated API responses remain no-store.
function fingerprint(name){
 let bytes=fs.readFileSync(path.join(out,name));
 if(name.endsWith('.css'))bytes=Buffer.from(bytes.toString().replace(/url\((\/fonts\/[^)]+)\)/g,(_,font)=>`url(/${fingerprint(font.slice(1))})`));
 const hash=crypto.createHash('sha256').update(bytes).digest('hex').slice(0,16);
 const asset=`assets/${hash}/${path.basename(name)}`;
 fs.mkdirSync(path.dirname(path.join(out,asset)),{recursive:true});fs.writeFileSync(path.join(out,asset),bytes);
 return asset;
}
const html=fs.readFileSync(path.join(out,'admin.html'),'utf8').replace('href="/" target="_blank"','href="https://www.juliproz.com/" target="_blank"')
 .replace(/(src|href)="([a-z][a-z0-9-]*\.(?:js|css))(?:\?[^\"]*)?"/g,(_,attr,name)=>`${attr}="${fingerprint(name)}"`);
fs.writeFileSync(path.join(out,'admin.html'),html);fs.writeFileSync(path.join(out,'index.html'),html);
require('./stage-images.cjs')(root,out);
console.log('Isolated admin assets prepared. No Telegram SDK or public catalogue.');

for(const file of ["index.html","admin.html"]){const target=path.join(out,file);if(fs.existsSync(target))fs.writeFileSync(target,fs.readFileSync(target,"utf8").replace('name="jp-release" content="development"','name="jp-release" content="'+(/^[a-f0-9]{40}$/.test(process.env.VERCEL_GIT_COMMIT_SHA||"")?process.env.VERCEL_GIT_COMMIT_SHA:"development")+'"'));}

// Only the WOFF2 files referenced by fonts.css are published.
for(const name of fs.readdirSync(path.join(out,"fonts"))){if(name.endsWith(".woff"))fs.rmSync(path.join(out,"fonts",name));}
