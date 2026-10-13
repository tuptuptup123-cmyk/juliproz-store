// Optional isolated admin deployment; do not enable on the public store project.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'apps/admin/dist');
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
for(const name of ['admin.html','admin.css','admin.js','admin-session.js','admin-selects.js','admin-workspace.js','analytics-report.js','fonts.css','config.js','image-policy.js','product-framing.js','catalog-taxonomy.js','product-sizes.js','product-sharing.js','product-sharing.css','product-pricing.js','photo-codec.js','photo-studio.js','photo-background.js','photo-worker.js','images','fonts','vendor']){const source=path.join(root,name);if(fs.existsSync(source))fs.cpSync(source,path.join(out,name),{recursive:true})}
const html=fs.readFileSync(path.join(out,'admin.html'),'utf8').replace('href="/" target="_blank"','href="https://www.juliproz.com/" target="_blank"');
fs.writeFileSync(path.join(out,'admin.html'),html);fs.writeFileSync(path.join(out,'index.html'),html);
require('./stage-photo-assets.cjs')(root,out);
console.log('Isolated admin assets prepared. No Telegram SDK or public catalogue.');
