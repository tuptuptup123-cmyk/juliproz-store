'use strict';
const {execFileSync}=require('node:child_process');
const path=require('node:path');
// Vercel: exit 0 skips a build, exit 1 builds. Missing history always builds.
const previous=process.env.VERCEL_GIT_PREVIOUS_SHA;
if(!/^[a-f0-9]{40}$/.test(previous||''))process.exit(1);
let build=true;
try{
 const changed=execFileSync('git',['diff','--name-only',previous,'HEAD'],{cwd:path.resolve(__dirname,'..'),encoding:'utf8'}).trim().split('\n');
 const shared=new Set(['config.js','runtime-errors.js','fonts.css','image-policy.js','product-framing.js','catalog-taxonomy.js','product-sizes.js','manager-contact.js','manager-contact.css','product-sharing.js','product-pricing.js','analytics.js','scripts/build-telegram.cjs','scripts/should-build-telegram.cjs','scripts/stage-photo-assets.cjs','scripts/stage-images.cjs','catalog-reader.js','telegram-sdk.js','server/analytics-relay.cjs','server/analytics.cjs','server/telegram-init-data.cjs','package.json','package-lock.json']);
 build=changed.some(file=>shared.has(file)||/^(apps\/telegram\/|images\/|fonts\/|photo-assets\/)/.test(file));
}catch{/* Missing history must never skip a necessary build. */}
process.exit(build?1:0);
