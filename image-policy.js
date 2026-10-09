// Product images come only from our deployment or our public storage bucket.
function safeProductImage(value){
  if(typeof value!=='string'||value.length>2048)return false;
  try{
    const u=new URL(value,'https://juliproz-store.vercel.app');
    if(u.protocol!=='https:'||u.username||u.password||u.port)return false;
    return (u.origin==='https://juliproz-store.vercel.app'&&u.pathname.startsWith('/images/')) ||
      (u.origin===new URL(window.STORE_CONFIG.url).origin&&u.pathname.startsWith('/storage/v1/object/public/product-photos/'));
  }catch{return false}
}

