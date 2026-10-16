const allowedOrigin='https://admin.juliproz.com';
const origins=new Set([allowedOrigin]);
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
  const operation=crypto.randomUUID();
  const gate=await fetch(base+'/rest/v1/rpc/store_begin_workspace_invite',{method:'POST',headers,body:JSON.stringify({p_email:email,p_name:name,p_operation:operation}),signal:AbortSignal.timeout(8000)});
  if(!gate.ok){const e=await gate.json().catch(()=>({}));return reply(gate.status,{code:e.code,message:e.message||'Не удалось проверить право приглашения'})}
  const serviceHeaders={apikey:secret,Authorization:'Bearer '+secret,'Content-Type':'application/json'};
  const finish=async(status,error=null)=>{
   const response=await fetch(base+'/rest/v1/rpc/store_finish_workspace_invite',{method:'POST',headers:serviceHeaders,body:JSON.stringify({p_operation:operation,p_status:status,p_error:error}),signal:AbortSignal.timeout(8000)});
   return response.ok&&await response.json()===true;
  };
  let invite;
  try{invite=await fetch(base+'/auth/v1/invite?redirect_to='+encodeURIComponent(allowedOrigin+'/admin.html'),{method:'POST',headers:serviceHeaders,body:JSON.stringify({email}),signal:AbortSignal.timeout(10000)})}
  catch{await finish('unknown','network_timeout').catch(()=>false);return reply(503,{delivery_status:'unknown',message:'Не удалось подтвердить отправку. Проверьте почту и обновите список команды. Если письмо пришло, повторно отправлять его не нужно.'})}
  if(!invite.ok){
   const delivery=invite.status>=500?'unknown':'failed';await finish(delivery,'provider_'+invite.status).catch(()=>false);
   return reply(invite.status===429?429:400,{delivery_status:delivery,message:delivery==='unknown'?'Почтовый сервер не подтвердил отправку. Проверьте почту перед повтором.':invite.status===429?'Письмо не отправлено: лимит почтового сервиса. Попробуйте позже.':'Письмо не отправлено. Повторите приглашение; если аккаунт уже создан, используйте восстановление пароля и добавление существующего аккаунта.'});
  }
  if(!await finish('sent').catch(()=>false))return reply(409,{invitation_sent:true,message:'Письмо отправлено, но статус доставки не сохранён. Обновите команду и проверьте почту. Не отправляйте приглашение повторно.'});
  const team=await fetch(base+'/rest/v1/rpc/store_workspace_team_secure',{method:'POST',headers,body:'{}',signal:AbortSignal.timeout(8000)});
  if(!team.ok)return reply(409,{message:'Приглашение отправлено. Обновите список команды; доступ нужно подтвердить отдельно после настройки MFA.'});
  return reply(200,{...await team.json(),invitation_sent:true});
 }catch{return reply(503,{message:'Сервер не ответил. Если письмо уже пришло, используйте «Добавить существующий аккаунт». Иначе повторите позже.'})}
});
