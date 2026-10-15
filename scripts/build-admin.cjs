// Optional isolated admin deployment; do not enable on the public store project.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'apps/admin/dist');
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
for(const name of ['admin.html','admin.css','admin.js','admin-session.js','admin-selects.js','admin-workspace.js','admin-sales.js','admin-schedule.js','analytics-report.js','fonts.css','config.js','image-policy.js','product-framing.js','catalog-taxonomy.js','product-sizes.js','product-sharing.js','product-sharing.css','product-pricing.js','photo-codec.js','photo-studio.js','photo-background.js','photo-worker.js','images','fonts','vendor']){const source=path.join(root,name);if(fs.existsSync(source))fs.cpSync(source,path.join(out,name),{recursive:true})}
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
require('./stage-photo-assets.cjs')(root,out);
console.log('Isolated admin assets prepared. No Telegram SDK or public catalogue.');
