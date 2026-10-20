'use strict';
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const app = path.join(root, 'apps/telegram'), out = path.join(app, 'dist');
fs.rmSync(out, {recursive: true, force: true});
fs.mkdirSync(out, {recursive: true});
// Interface files belong to this application. Never regenerate them from the website.
for (const name of ['index.html', 'privacy.html', 'app.js', 'style.css', 'product-sharing.css', 'catalog-notice.js']) {
  fs.copyFileSync(path.join(app, name), path.join(out, name));
}
// Catalogue rules, prices, stock, brand assets and analytics have one source.
for (const name of ['config.js', 'runtime-errors.js','fonts.css', 'image-policy.js', 'product-framing.js', 'catalog-taxonomy.js', 'product-sizes.js','catalog-reader.js','telegram-sdk.js', 'manager-contact.js','manager-contact.css','product-sharing.js', 'product-pricing.js', 'analytics.js',  'fonts']) {
  fs.cpSync(path.join(root, name), path.join(out, name), {recursive: true});
}
require('./stage-images.cjs')(root,out);
console.log('Independent Telegram storefront built; no admin, server sources or website translations.');

for(const file of ["index.html","admin.html"]){const target=path.join(out,file);if(fs.existsSync(target))fs.writeFileSync(target,fs.readFileSync(target,"utf8").replace('name="jp-release" content="development"','name="jp-release" content="'+(/^[a-f0-9]{40}$/.test(process.env.VERCEL_GIT_COMMIT_SHA||"")?process.env.VERCEL_GIT_COMMIT_SHA:"development")+'"'));}

// Only the WOFF2 files referenced by fonts.css are published.
for(const name of fs.readdirSync(path.join(out,"fonts"))){if(name.endsWith(".woff"))fs.rmSync(path.join(out,"fonts",name));}
