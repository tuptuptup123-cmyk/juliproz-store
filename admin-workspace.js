/* Private workspace UI. Every endpoint independently checks membership and MFA. */
(function(){
 let team=null,teamRequest=0,historyRequest=0,historyCursor=null,historyRows=[],historyBusy=false;
 const labels={brand:'Бренд',name:'Название',category:'Категория',size:'Размеры / варианты',price:'Цена',currency:'Валюта',image_url:'Обложка',photos:'Фотографии',archive_status:'Статус архива',available:'В продаже',reserved:'Бронь',fulfillment_status:'Наличие',gender:'Раздел',description:'Описание',product_condition:'Состояние',stock_quantities:'Остатки',on_commission:'Комиссия',original_price:'Цена до скидки',wear_condition:'Следы носки',note:'Внутренняя заметка',location:'Где находится',custodian:'У кого находится',display_name:'Имя администратора',access_role:'Роль'};
 const rpc=(name,body={})=>request('/rest/v1/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 function hidePanels(){$('profilePanel').classList.add('hidden');$('historyPanel').classList.add('hidden');$('teamPanel').classList.add('hidden')}
 function clear(){team=null;teamRequest++;historyRequest++;historyCursor=null;historyRows=[];historyBusy=false;hidePanels();for(const id of ['historyList','teamMembers','currentAdminProfile','profileEmail','teamStatus','profileStatus','historyStatus'])$(id).textContent='';$('historyActor').innerHTML='<option value="">Все администраторы</option>';$('historyProduct').value='';$('profileForm').reset();$('addAdminForm').reset();$('addAdminForm').classList.add('hidden')}
 function invitationStatus(invite){
  if(invite.ready)return 'Почта подтверждена · Аутентификатор настроен · Ожидает вашего одобрения';
  if(typeof invite.email_confirmed!=='boolean')return 'Ожидаем подтверждение почты и настройку аутентификатора';
  return `Почта: ${invite.email_confirmed?'подтверждена':'не подтверждена'} · Аутентификатор: ${invite.mfa_confirmed?'настроен':'не настроен'}${invite.email_confirmed&&invite.mfa_confirmed?' · Требуется проверка аккаунта':''}`;
 }
 function applyTeam(data){
  if(!data||!Array.isArray(data.members)||data.current_user_id!==session?.user?.id)throw Error('Не удалось проверить профиль');
  team=data;const me=data.members.find(m=>m.user_id===data.current_user_id);if(!me)throw Error('Нет доступа к команде');
  $('currentAdminProfile').textContent=me.display_name||me.email;
  $('profileEmail').textContent=me.email;$('profileForm').elements.display_name.value=me.display_name||'';
  $('addAdminForm').classList.toggle('hidden',me.access_role!=='owner');
  $('teamMembers').innerHTML=data.members.map(m=>`<article class="team-member"><div><strong>${esc(m.display_name||'Имя не указано')}</strong><p>${esc(m.email)}</p><small>${m.access_role==='owner'?'Владелец':'Администратор'}${m.user_id===me.user_id?' · это вы':''}</small></div>${me.access_role==='owner'&&m.access_role!=='owner'?`<button type="button" data-revoke-admin="${esc(m.user_id)}">Отключить доступ</button>`:''}</article>`).join('');
  if(me.access_role==='owner')$('teamMembers').innerHTML+=(data.pending_invitations||[]).map(i=>`<article class="team-member"><div><strong>${esc(i.display_name||'Приглашение')}</strong><p>${esc(i.email)}</p><small>${invitationStatus(i)}</small></div>${i.ready?`<button type="button" data-approve-invite="${esc(i.email)}">Подтвердить доступ</button>`:''}</article>`).join('');
  const selected=$('historyActor').value;$('historyActor').innerHTML='<option value="">Все администраторы</option>'+data.members.map(m=>`<option value="${esc(m.user_id)}">${esc(m.display_name||m.email)}</option>`).join('');$('historyActor').value=selected;window.AdminSelects?.sync();
 }
 async function loadTeam(){
  if(!session)return;const id=++teamRequest,epoch=sessionEpoch;$('teamStatus').textContent='Загружаем профили…';$('profileStatus').textContent=activeView==='profile'?'Загружаем профиль…':'';
  try{const data=await rpc('store_workspace_team');if(id!==teamRequest||epoch!==sessionEpoch)return;applyTeam(data);$('teamStatus').textContent='';$('profileStatus').textContent=''}catch(e){if(id===teamRequest&&epoch===sessionEpoch){$('teamStatus').textContent='Не удалось загрузить команду: '+e.message;$('profileStatus').textContent='Не удалось загрузить профиль: '+e.message}}
 }
 function valueText(value){if(value==null||value==='')return '—';if(typeof value==='boolean')return value?'Да':'Нет';if(typeof value==='object')return JSON.stringify(value,null,2);return String(value)}
 function renderHistory(){
  $('historyList').innerHTML=historyRows.map(r=>{const date=new Date(r.changed_at),isProduct=['products','product_admin_notes'].includes(r.entity),action={INSERT:'Создано',UPDATE:'Изменено',DELETE:'Удалено'}[r.operation]||r.operation,title=isProduct?`Товар № ${r.record_id}${r.entity==='product_admin_notes'?' · внутренняя информация':''}`:'Профиль / доступ администратора';return `<article class="history-entry"><div class="history-entry-heading"><strong>${esc(title)}</strong><span>${esc(action)}</span></div>${r.product_label?`<p>${esc(r.product_label)}</p>`:''}<p class="history-meta"><time datetime="${esc(r.changed_at)}">${esc(Number.isNaN(date.getTime())?r.changed_at:date.toLocaleString('ru-RU'))}</time> · ${esc(r.actor_label)}${r.actor_id?` <small>(${esc(r.actor_id.slice(0,8))})</small>`:''}</p><details><summary>Что изменилось</summary><div class="history-changes">${Object.entries(r.changes||{}).map(([k,v])=>`<div class="history-change"><h3>${esc(labels[k]||k)}</h3><div><span>Было</span><pre>${esc(valueText(v.before))}</pre></div><div><span>Стало</span><pre>${esc(valueText(v.after))}</pre></div></div>`).join('')||'<p>Служебное изменение без изменения полей товара.</p>'}</div></details></article>`}).join('')||'<p class="empty-state">Изменений по этому фильтру пока нет.</p>';
 }
 async function loadHistory(more=false){
  if(!session||more&&historyBusy)return;
  const product=$('historyProduct').value.trim(),actor=$('historyActor').value;
  if(product&&!/^\d{1,18}$/.test(product)){$('historyStatus').textContent='Укажите числовой артикул товара.';return}
  const id=++historyRequest,epoch=sessionEpoch;historyBusy=true;$('moreHistory').disabled=true;$('historyStatus').textContent='Загружаем историю…';
  if(!more){historyRows=[];historyCursor=null;$('historyList').innerHTML='';$('moreHistory').classList.add('hidden')}
  try{const rows=await rpc('store_workspace_history',{p_before:more?historyCursor:null,p_product_id:product||null,p_actor_id:actor||null});if(id!==historyRequest||epoch!==sessionEpoch)return;
   if(!Array.isArray(rows))throw Error('Некорректный ответ сервера');
   const page=rows.slice(0,30);historyRows=more?historyRows.concat(page):page;historyCursor=page.at(-1)?.id||null;renderHistory();$('moreHistory').classList.toggle('hidden',rows.length<=30);$('historyStatus').textContent=`Показано записей: ${historyRows.length}`;
  }catch(e){if(id===historyRequest&&epoch===sessionEpoch)$('historyStatus').textContent='Не удалось загрузить историю: '+e.message}
  finally{if(id===historyRequest){historyBusy=false;$('moreHistory').disabled=false}}
 }
 function onView(view){hidePanels();if(view==='profile'){$('profilePanel').classList.remove('hidden');loadTeam()}if(view==='history'){$('historyPanel').classList.remove('hidden');loadHistory()}if(view==='team'){$('teamPanel').classList.remove('hidden');loadTeam()}}
 async function mutateTeam(button,task){if(busy)return;busy=true;button.disabled=true;const epoch=sessionEpoch;
  try{const result=await task();if(epoch!==sessionEpoch)return;applyTeam(result);$('teamStatus').textContent=result.invitation_sent?'Приглашение отправлено. Доступ будет предоставлен только после вашего отдельного подтверждения.':'Сохранено.';$('profileStatus').textContent='Сохранено.'}catch(e){if(epoch===sessionEpoch){$('teamStatus').textContent=e.message;$('profileStatus').textContent=e.message}}finally{busy=false;button.disabled=false}
 }
 $('profileForm').onsubmit=e=>{e.preventDefault();const name=e.target.elements.display_name.value.trim();if(!name)return;mutateTeam(e.submitter,()=>rpc('store_save_workspace_profile',{p_name:name}))};
 $('addAdminForm').onsubmit=e=>{e.preventDefault();const email=e.target.elements.email.value.trim().toLowerCase(),name=e.target.elements.display_name.value.trim(),confirmation=e.target.elements.email_confirmation?.value.trim().toLowerCase();if(!email||!name)return;if(email!==confirmation){$('teamStatus').textContent='Два адреса почты должны совпадать.';return}if(!confirm(e.submitter.value==='existing'?`Предоставить ${name} (${email}) доступ ко всем товарам и внутренней информации магазина?`:`Отправить приглашение ${name} (${email})? Доступ подтвердите отдельно после настройки MFA.`))return;mutateTeam(e.submitter,async()=>{const result=e.submitter.value==='existing'?await rpc('store_add_workspace_admin',{p_email:email,p_name:name}):await request('/functions/v1/invite-store-admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,name})});if(session)e.target.reset();return result})};
 $('teamMembers').addEventListener('click',e=>{const approved=e.target.closest('[data-approve-invite]');if(approved){const invite=team?.pending_invitations?.find(i=>i.email===approved.dataset.approveInvite);if(!invite?.ready||!confirm(`Подтвердить доступ ${invite.display_name} (${invite.email}) ко всем товарам и внутренней информации?`))return;mutateTeam(approved,()=>rpc('store_add_workspace_admin',{p_email:invite.email,p_name:invite.display_name}));return}const b=e.target.closest('[data-revoke-admin]');if(!b)return;const member=team?.members.find(m=>m.user_id===b.dataset.revokeAdmin);if(!member||!confirm(`Отключить доступ ${member.display_name||member.email}? История его изменений сохранится.`))return;mutateTeam(b,()=>rpc('store_remove_workspace_admin',{p_user_id:member.user_id}))});
 $('refreshTeam').onclick=loadTeam;$('refreshHistory').onclick=()=>loadHistory();$('applyHistoryFilter').onclick=()=>loadHistory();$('moreHistory').onclick=()=>loadHistory(true);$('clearHistoryFilter').onclick=()=>{$('historyProduct').value='';$('historyActor').value='';window.AdminSelects?.sync();loadHistory()};
 $('productHistoryBtn').onclick=()=>{if(editing==null)return;const id=editing;if(busy||!leaveEditor())return;$('historyProduct').value=String(id);$('historyActor').value='';selectView('history')};
 window.AdminWorkspace={clear,hidePanels,onView,loadTeam};
 if(session&&!$('workspace').classList.contains('hidden'))loadTeam();
})();
