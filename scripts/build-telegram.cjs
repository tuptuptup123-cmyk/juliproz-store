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
for (const name of ['config.js', 'fonts.css', 'image-policy.js', 'product-framing.js', 'catalog-taxonomy.js', 'product-sizes.js','catalog-reader.js','telegram-sdk.js', 'product-sharing.js', 'product-pricing.js', 'analytics.js',  'fonts']) {
  fs.cpSync(path.join(root, name), path.join(out, name), {recursive: true});
}
require('./stage-images.cjs')(root,out);
console.log('Independent Telegram storefront built; no admin, server sources or website translations.');
