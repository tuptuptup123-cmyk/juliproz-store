// Every public read requires a currently published product. Originals stay private.
const origin='https://admin.juliproz.com';
Deno.serve(async req=>{
 const cors=req.headers.get('origin')===origin?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey','Access-Control-Allow-Methods':'GET, HEAD, OPTIONS'}:{};
 const headers={...cors,'Cache-Control':'no-store','Vary':'Origin, Authorization','X-Content-Type-Options':'nosniff'},deny=status=>new Response(null,{status,headers});
 if(req.method==='OPTIONS')return deny(204);if(!['GET','HEAD'].includes(req.method))return deny(405);
 const input=new URL(req.url),prefix='/product-photo/',offset=input.pathname.indexOf(prefix),asset=offset<0?'':input.pathname.slice(offset+prefix.length);
 if(asset.length>256||!/^[A-Za-z0-9_/-]+\.(?:png|webp|jpe?g)$/.test(asset)||input.search)return deny(404);
 const base=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_ANON_KEY'),secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!base||!key||!secret)return deny(503);
 const canonical=base+'/storage/v1/object/public/product-photos/'+asset,auth=req.headers.get('authorization'),lookup={apikey:key,...(auth?{Authorization:auth}:{})};
 try{
  const filter='(image_url.eq."'+canonical+'",photos.cs.["'+canonical+'"])';
  const products=await fetch(base+'/rest/v1/products?select=id&or='+encodeURIComponent(filter)+(auth?'':'&available=eq.true')+'&limit=1',{headers:lookup,redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!products.ok)return deny(products.status===401?401:503);
  const rows=await products.json();if(!Array.isArray(rows)||!rows.length)return deny(404);
  const image=await fetch(base+'/storage/v1/object/authenticated/product-photos/'+asset,{method:req.method,headers:{apikey:secret,Authorization:'Bearer '+secret},redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!image.ok)return deny(image.status===404?404:503);
  const type=image.headers.get('Content-Type')?.split(';')[0];if(!['image/png','image/jpeg','image/webp'].includes(type))return deny(404);
  return new Response(req.method==='HEAD'?null:image.body,{status:200,headers:{...headers,'Content-Type':type}});
 }catch{return deny(503)}
});
