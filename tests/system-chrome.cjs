'use strict';
// CI-only: reuse the browser installed on the GitHub Ubuntu image.
if(process.env.QA_SYSTEM_CHROME==='1'){
 const {chromium}=require('playwright'),launch=chromium.launch.bind(chromium);
 chromium.launch=options=>launch({...options,channel:'chrome'});
}
