const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'dist');
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out);
const files=['index.html','privacy.html','admin-redirect.js','fonts.css','style.css','styles.css','app.js','catalog-notice.js','config.js','image-policy.js','product-framing.js','catalog-taxonomy.js','product-sizes.js','product-sharing.js','product-sharing.css','product-pricing.js','analytics.js'];
for(const name of [...files,'images','fonts','vendor']){const source=path.join(root,name);if(fs.existsSync(source))fs.cpSync(source,path.join(out,name),{recursive:true});}
fs.copyFileSync(path.join(root,'admin-redirect.html'),path.join(out,'admin.html'));
require('./stage-photo-assets.cjs')(root,out);
console.log('Public assets staged; internal source and SQL excluded.');
