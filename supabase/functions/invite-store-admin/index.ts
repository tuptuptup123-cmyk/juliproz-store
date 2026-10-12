const allowedOrigin='https://juliproz-store.vercel.app';
const origins=new Set([allowedOrigin,'https://juliproz.com','https://www.juliproz.com']);
const cors={'Access-Control-Allow-Origin':allowedOrigin,'Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Cache-Control':'no-store'};
Deno.serve(async req=>{
 const origin=req.headers.get('origin');
 const corsHeaders={...cors,'Access-Control-Allow-Origin':origins.has(origin)?origin:allowedOrigin};
 const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
 if(req.headers.get('origin')&&!origins.has(req.headers.get('origin')))return reply(403,{message:'Недопустимый источник запроса'});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders});
 if(req.method!=='POST')return reply(405,{message:'Используйте POST'});
 const auth=req.headers.get('authorization');if(!auth?.startsWith('Bearer '))return reply(401,{message:'Войдите в аккаунт владельца'});
 const base=Deno.env.get('SUPABASE_URL'),publicKey=Deno.env.get('SUPABASE_ANON_KEY'),secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!base||!publicKey||!secret)return reply(503,{message:'Приглашения временно недоступны'});
 try{
  const raw=await req.text();if(raw.length>4096)return reply(413,{message:'Слишком большой запрос'});
  let data;try{data=JSON.parse(raw)}catch{return reply(400,{message:'Некорректный запрос'})}
  const email=typeof data?.email==='string'?data.email.trim().toLowerCase():'',name=typeof data?.name==='string'?data.name.trim():'';
  if(!email||email.length>320||!name||name.length>100)return reply(400,{message:'Укажите email и имя сотрудника'});
  const headers={apikey:publicKey,Authorization:auth,'Content-Type':'application/json'};
  const user=await fetch(base+'/auth/v1/user',{headers,signal:AbortSignal.timeout(8000)});if(!user.ok)return reply(401,{message:'Сессия завершена. Войдите заново.'});
  // This RPC verifies owner membership, AAL2 and a durable rate limit before any email is sent.
  const gate=await fetch(base+'/rest/v1/rpc/store_prepare_workspace_invite',{method:'POST',headers,body:JSON.stringify({p_email:email,p_name:name}),signal:AbortSignal.timeout(8000)});
  if(!gate.ok){const e=await gate.json().catch(()=>({}));return reply(gate.status,{message:e.message||'Не удалось проверить право приглашения'})}
  const invite=await fetch(base+'/auth/v1/invite?redirect_to='+encodeURIComponent(allowedOrigin+'/admin.html'),{method:'POST',headers:{apikey:secret,Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify({email}),signal:AbortSignal.timeout(10000)});
  if(!invite.ok)return reply(invite.status===429?429:400,{message:invite.status===429?'Лимит отправки писем. Попробуйте позже.':'Не удалось отправить приглашение. Если аккаунт уже существует, используйте добавление существующего аккаунта.'});
  const grant=await fetch(base+'/rest/v1/rpc/store_add_workspace_admin',{method:'POST',headers,body:JSON.stringify({p_email:email,p_name:name}),signal:AbortSignal.timeout(8000)});
  if(!grant.ok)return reply(409,{message:'Приглашение отправлено, но доступ не добавлен. Повторите через «Добавить существующий аккаунт».'});
  return reply(200,await grant.json());
 }catch{return reply(503,{message:'Сервер не ответил. Если письмо уже пришло, используйте «Добавить существующий аккаунт». Иначе повторите позже.'})}
});
