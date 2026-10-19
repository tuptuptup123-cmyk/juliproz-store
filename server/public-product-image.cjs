'use strict';
const config=require('../config.js');
function photo(value){try{const u=new URL(value,'https://juliproz-store.vercel.app');if(u.username||u.password||u.search||u.hash)return null;if(u.origin==='https://juliproz-store.vercel.app'&&u.pathname.startsWith('/images/'))return u.href;if(u.origin===config.url&&/^\/(storage\/v1\/object\/public\/product-photos|functions\/v1\/product-photo)\//.test(u.pathname))return u.href.replace('/storage/v1/object/public/product-photos/','/functions/v1/product-photo/')}catch{}return null}
module.exports={photo};
