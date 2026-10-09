const events=new Set(['visit','heartbeat','page_view','product_view','wishlist_add','wishlist_remove','cart_add','cart_remove','checkout_open','manager_open']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const origin='https://juliproz-store.vercel.app';
Deno.serve(async(req:Request)=>{
 const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
 const reply=(status:number,value:unknown)=>new Response(JSON.stringify(value),{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply(405,{error:'method'});
 if(req.headers.get('origin')!==origin)return reply(403,{error:'origin'});
 if(Number(req.headers.get('content-length')||0)>2048)return reply(413,{error:'size'});
 try{
  const text=await req.text();if(text.length>2048)return reply(413,{error:'size'});const b=JSON.parse(text);
  if(!uuid.test(b.event_id)||!uuid.test(b.visitor_id)||!uuid.test(b.session_id)||!events.has(b.event)||b.product_id!=null&&(!Number.isSafeInteger(b.product_id)||b.product_id<1)||b.page!=null&&!['catalog','wishlist','cart'].includes(b.page))return reply(400,{error:'event'});
  const ip=(req.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim();
  // Only a daily salted fingerprint is retained; no raw IP or Telegram identity.
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}:${new Date().toISOString().slice(0,10)}:${ip}`));
  const fingerprint=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
  const response=await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/store_analytics_ingest`,{method:'POST',headers:{apikey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,Authorization:`Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,'Content-Type':'application/json'},body:JSON.stringify({p_event_id:b.event_id,p_visitor:b.visitor_id,p_session:b.session_id,p_event:b.event,p_product:b.product_id??null,p_page:b.page??null,p_fingerprint:fingerprint})});
  if(!response.ok)return reply(503,{error:'unavailable'});const accepted=await response.json();return reply(accepted?202:429,{accepted});
 }catch{return reply(400,{error:'invalid'})}
});
