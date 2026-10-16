/* Private duty calendar. The database owns assignments, attribution and counts. */
(function(root){
 'use strict';
 const monthOf=day=>day.slice(0,7)+'-01';
 function shiftMonth(day,delta){const d=new Date(day+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+delta,1);return d.toISOString().slice(0,10)}
 function dayState(day,today){if(!day.manager_id)return 'free';if(!day.active)return 'inactive';if(day.uploaded>=day.target)return 'done';return day.day<today?'missed':day.day===today?'today':'planned'}
 function totals(data){
  const rows=new Map(data.members.map(m=>[m.user_id,{id:m.user_id,name:m.display_name,uploaded:0,deleted:0,duties:0,completed:0}]));
  for(const c of data.counts){const key=c.actor_id||'system';if(!rows.has(key))rows.set(key,{id:c.actor_id,name:c.label,uploaded:0,deleted:0,duties:0,completed:0});const r=rows.get(key);r.uploaded+=c.count;r.deleted+=c.deleted_count;}
  for(const d of data.days){if(!d.manager_id)continue;if(!rows.has(d.manager_id))rows.set(d.manager_id,{id:d.manager_id,name:d.manager_label,uploaded:0,deleted:0,duties:0,completed:0});const r=rows.get(d.manager_id);r.duties++;if(d.day<=data.today&&d.uploaded>=d.target)r.completed++;}
  return [...rows.values()].sort((a,b)=>b.uploaded-a.uploaded||a.name.localeCompare(b.name,'ru'));
 }
 const logic={monthOf,shiftMonth,dayState,totals};
 if(typeof module==='object'&&module.exports){module.exports=logic;return}
 let data=null,month=null,selected=null,requestId=0,itemRequest=0,loading=false,mutating=false,dirty=false,dayDirty=false,rotationDirty=false,lastLoaded=0,queue=[],itemRows=[],itemCursor=null;
 const rpc=(name,body={})=>request('/rest/v1/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 // The home summary is read-only and never delays the inventory.
 let homeEpoch=0,homeBusy=false,homeLoaded=0;
 function resetHome(){homeEpoch++;homeBusy=false;homeLoaded=0;$('homePlanLabel').textContent='План на сегодня';$('homePlanValue').textContent='Открыть расписание ↗';$('homePlanProgress').classList.add('hidden')}
 function renderHome(next){
  const day=next.days.find(d=>d.day===next.today),own=day?.manager_id===session?.user?.id;
  $('homePlanLabel').textContent=own?'Ваш план на сегодня':day?.manager_label?'Сегодня · '+day.manager_label:'План на сегодня';
  $('homePlanValue').textContent=!day?.manager_id?'Дежурство не назначено':!day.active?'Нужна замена':`${day.uploaded} из ${day.target} вещей${day.uploaded>=day.target?' · готово':''}`;
  const progress=$('homePlanProgress');progress.classList.toggle('hidden',!day?.active||!day?.target);progress.max=day?.target||1;progress.value=Math.min(day?.uploaded||0,day?.target||1);
 }
 async function loadHome(force=false){
  if(!session||homeBusy||(!force&&Date.now()-homeLoaded<60000))return;
  homeBusy=true;const id=++homeEpoch,epoch=sessionEpoch;
  try{const next=await rpc('store_upload_schedule',{p_month:null});if(id!==homeEpoch||epoch!==sessionEpoch)return;if(next?.current_user_id!==session.user.id||!Array.isArray(next.days))throw Error('Invalid schedule');homeLoaded=Date.now();renderHome(next)}
  catch{if(id===homeEpoch&&epoch===sessionEpoch){homeLoaded=Date.now();$('homePlanLabel').textContent='План на сегодня';$('homePlanValue').textContent='Проверить расписание ↗';$('homePlanProgress').classList.add('hidden')}}
  finally{if(id===homeEpoch)homeBusy=false}
 }
 const formatDay=(day,options={day:'numeric',month:'long'})=>new Intl.DateTimeFormat('ru-RU',{...options,timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'));
 const chosen=()=>data?.days.find(d=>d.day===selected);
 function lockForms(value){$('scheduleDayForm').inert=value;$('scheduleRotationForm').inert=value}
 function resetDirty(){dirty=dayDirty=rotationDirty=false}
 function hide(){$('schedulePanel').classList.add('hidden');requestId++;itemRequest++;loading=false;lockForms(false)}
 function clear(){resetHome();hide();data=null;month=null;selected=null;queue=[];itemRows=[];itemCursor=null;resetDirty();mutating=false;document.querySelectorAll('#scheduleDayForm input,#scheduleDayForm select,#scheduleDayForm button,#scheduleRotationForm input,#scheduleRotationForm button').forEach(el=>el.disabled=false);lastLoaded=0;for(const id of ['scheduleCalendar','scheduleToday','schedulePeople','scheduleDaySummary','scheduleItems','scheduleQueue','scheduleStatus','scheduleItemStatus'])$(id).textContent='';$('scheduleDayForm').reset();$('scheduleRotationForm').reset();$('scheduleManagerFilter').innerHTML='';$('scheduleOwner').classList.add('hidden');$('scheduleDayForm').classList.add('hidden');}
 function mayDiscard(){return !dirty||confirm('Перейти без сохранения изменений расписания?')}
 function mayLeave(){if(activeView!=='schedule')return true;if(mutating||!mayDiscard())return false;resetDirty();return true}
 function stateLabel(d){return {free:'Без дежурства',inactive:'Нужна замена',done:'План выполнен',missed:'План не выполнен',today:'Сегодня',planned:'По плану'}[dayState(d,data.today)]}
 function renderCalendar(){
  $('scheduleMonthLabel').textContent=formatDay(month,{month:'long',year:'numeric'});
  const offset=(new Date(month+'T12:00:00Z').getUTCDay()+6)%7;
  $('scheduleCalendar').innerHTML='<div class="schedule-weekday">Пн</div><div class="schedule-weekday">Вт</div><div class="schedule-weekday">Ср</div><div class="schedule-weekday">Чт</div><div class="schedule-weekday">Пт</div><div class="schedule-weekday">Сб</div><div class="schedule-weekday">Вс</div>'+'<span class="schedule-pad" aria-hidden="true"></span>'.repeat(offset)+data.days.map(d=>`<button type="button" class="schedule-day is-${dayState(d,data.today)}" data-schedule-day="${esc(d.day)}" aria-pressed="${d.day===selected}" ${d.day===data.today?'aria-current="date"':''} aria-label="${esc(formatDay(d.day))}, ${esc(d.manager_label||'Без дежурства')}, ${d.uploaded} из ${d.target}, ${stateLabel(d)}"><span class="schedule-date">${Number(d.day.slice(-2))}<small>${esc(formatDay(d.day,{weekday:'short'}))}</small>${d.is_override?'<i title="Дежурство изменено">*</i>':''}</span><strong>${esc(d.manager_label||'—')}</strong><span class="schedule-progress">${d.target?`${d.uploaded} / ${d.target}`:'Без дежурства'}</span><span class="schedule-state">${stateLabel(d)}</span></button>`).join('');
 }
 function renderToday(){
  const d=data.days.find(d=>d.day===data.today);
  $('scheduleToday').innerHTML=d?`<div><span class="eyebrow">СЕГОДНЯ · ${esc(formatDay(d.day))}</span><h2>${esc(d.manager_label||'Дежурство не назначено')}${d.manager_id===session?.user?.id?' · ваша очередь':''}</h2><p>${d.target?`${d.uploaded} из ${d.target} новых вещей · ${d.uploaded>=d.target?'план выполнен':`осталось ${d.target-d.uploaded}`}`:'Выберите менеджера в календаре.'}${d.manager_id&&!d.active?' · Нужна замена: доступ сотрудника отключён.':''}</p></div>${d.target?`<div class="schedule-today-progress"><strong>${d.uploaded}<span> / ${d.target}</span></strong><progress max="${d.target}" value="${Math.min(d.uploaded,d.target)}" aria-label="План на сегодня"></progress></div>`:''}`:`<div><span class="eyebrow">АРХИВ И ПЛАН</span><h2>${esc(formatDay(month,{month:'long',year:'numeric'}))}</h2><p>Выберите день, чтобы увидеть дежурного и добавленные вещи.</p></div>`;
 }
 function renderPeople(){
  $('schedulePeople').innerHTML=totals(data).map(r=>`<tr><th scope="row">${esc(r.name)}${r.id===session?.user?.id?' <small>вы</small>':''}</th><td><strong>${r.uploaded}</strong>${r.deleted?`<small>Удалено: ${r.deleted}</small>`:''}</td><td>${r.duties}</td><td>${r.completed}</td></tr>`).join('')||'<tr><td colspan="4">Пока нет данных.</td></tr>';
 }
 function managerOptions(blank='Без дежурства'){return `<option value="">${blank}</option>`+data.members.map(m=>`<option value="${esc(m.user_id)}">${esc(m.display_name)}</option>`).join('')}
 function renderDay(){
  const d=chosen();if(!d)return;
  $('scheduleDayTitle').textContent=formatDay(d.day,{day:'numeric',month:'long',weekday:'long'});
  const counts=data.counts.filter(c=>c.day===d.day);
  $('scheduleDaySummary').innerHTML=`<p><strong>${esc(d.manager_label||'Без дежурного')}</strong> · ${d.target?`${d.uploaded} / ${d.target} · ${stateLabel(d)}`:'План не назначен'}</p>${d.note?`<p>${esc(d.note)}</p>`:''}${counts.length?`<div class="schedule-day-counts">${counts.map(c=>`<span>${esc(c.label)} <strong>${c.count}</strong>${c.deleted_count?` <small>удалено: ${c.deleted_count}</small>`:''}</span>`).join('')}</div>`:'<p class="muted">В этот день новых вещей пока нет.</p>'}`;
  const editable=data.can_manage&&d.day>=data.today&&d.day<=new Date(new Date(data.today+'T12:00:00Z').getTime()+366*86400000).toISOString().slice(0,10);
  $('scheduleDayForm').classList.toggle('hidden',!editable);
  $('scheduleDayManager').innerHTML=managerOptions();$('scheduleDayManager').value=data.members.some(m=>m.user_id===d.manager_id)?d.manager_id||'':'';
  $('scheduleDayNote').value=d.note;$('scheduleDayReset').classList.toggle('hidden',!d.is_override);
  $('scheduleManagerFilter').innerHTML=managerOptions('Все менеджеры');$('scheduleManagerFilter').value='';
  $('schedulePastNote').classList.toggle('hidden',d.day>=data.today);
  window.AdminSelects?.sync();return loadItems();
 }
 function renderQueue(){
  $('scheduleQueue').innerHTML=queue.map((r,i)=>`<li><label><input type="checkbox" data-queue-id="${esc(r.id)}" ${r.included?'checked':''}><span>${esc(r.name)}</span></label><div><button type="button" data-queue-move="${i}" data-direction="-1" aria-label="${esc(r.name)}: выше" ${i===0?'disabled':''}>↑</button><button type="button" data-queue-move="${i}" data-direction="1" aria-label="${esc(r.name)}: ниже" ${i===queue.length-1?'disabled':''}>↓</button></div></li>`).join('');
 }
 function initQueue(){
  const start=$('scheduleRotationStart').value||data.today;
  const version=[...data.rotations].reverse().find(r=>r.starts_on<=start),ids=version?.manager_ids||data.members.filter(m=>m.access_role==='admin').map(m=>m.user_id);
  queue=[...ids.filter(id=>data.members.some(m=>m.user_id===id)),...data.members.map(m=>m.user_id).filter(id=>!ids.includes(id))].map(id=>({id,name:data.members.find(m=>m.user_id===id).display_name,included:ids.includes(id)}));renderQueue();
 }
 async function load(){
  if(!session||activeView!=='schedule'||mutating)return;const id=++requestId,epoch=sessionEpoch;loading=true;lockForms(true);$('scheduleStatus').textContent='Обновляем расписание…';
  try{const next=await rpc('store_upload_schedule',{p_month:month});if(id!==requestId||epoch!==sessionEpoch||activeView!=='schedule')return;
   if(!next||next.current_user_id!==session.user.id||!Array.isArray(next.days)||!Array.isArray(next.counts)||!Array.isArray(next.members)||!Array.isArray(next.rotations))throw Error('Некорректный ответ сервера');
   data=next;month=next.month;if(!next.days.some(d=>d.day===selected))selected=next.days.some(d=>d.day===next.today)?next.today:month;resetDirty();lastLoaded=Date.now();if(next.days.some(d=>d.day===next.today)){homeEpoch++;homeBusy=false;homeLoaded=Date.now();renderHome(next)}
   renderToday();renderCalendar();renderPeople();renderDay();$('scheduleOwner').classList.toggle('hidden',!data.can_manage);$('scheduleRotationStart').min=data.today;$('scheduleRotationStart').value=selected>=data.today?selected:data.today;initQueue();
   $('scheduleStatus').textContent='Обновлено '+new Intl.DateTimeFormat('ru-RU',{timeZone:data.time_zone,hour:'2-digit',minute:'2-digit'}).format(new Date())+' · время Киева';return true;
  }catch(e){if(id===requestId&&epoch===sessionEpoch)$('scheduleStatus').textContent='Не удалось загрузить расписание: '+e.message;}
  finally{if(id===requestId){loading=false;lockForms(false)}}
 }
 async function loadItems(more=false){
  if(!data||!session)return;const id=++itemRequest,epoch=sessionEpoch,day=selected,actor=$('scheduleManagerFilter').value||null;
  if(!more){itemRows=[];itemCursor=null;$('scheduleItems').textContent='';}$('scheduleMoreItems').classList.add('hidden');$('scheduleItemStatus').textContent='Загружаем вещи…';
  try{const rows=await rpc('store_upload_items',{p_day:day,p_actor_id:actor,p_before:more?itemCursor:null});if(id!==itemRequest||epoch!==sessionEpoch||activeView!=='schedule')return;if(!Array.isArray(rows))throw Error('Некорректный ответ сервера');const page=rows.slice(0,30);itemRows=more?itemRows.concat(page):page;itemCursor=page.at(-1)?.id||null;
   $('scheduleItems').innerHTML=itemRows.map(r=>`<li><div>${r.exists?`<button type="button" class="text-button" data-upload-product="${esc(r.product_id)}">${esc(r.title||'Товар')} · № ${esc(r.product_id)}</button>`:`<strong>${esc(r.title||'Товар')} · № ${esc(r.product_id)}</strong>`}<p>${esc(r.actor_label)} · ${esc(new Intl.DateTimeFormat('ru-RU',{timeZone:data.time_zone,hour:'2-digit',minute:'2-digit'}).format(new Date(r.created_at)))} · ${!r.exists?'Удалена — не засчитана':r.archive_status==='sold'?'Продана':r.available?'В продаже':'Скрыта'}</p></div></li>`).join('');
   $('scheduleItemStatus').textContent=itemRows.length?`Показано карточек: ${itemRows.length}`:'Новых карточек по этому фильтру нет.';$('scheduleMoreItems').classList.toggle('hidden',rows.length<=30);
  }catch(e){if(id===itemRequest&&epoch===sessionEpoch)$('scheduleItemStatus').textContent='Не удалось загрузить вещи: '+e.message;}
 }
 async function mutate(button,name,body){
  if(mutating||busy||loading||!data?.can_manage)return;mutating=true;busy=true;const epoch=sessionEpoch,controls=[...document.querySelectorAll('#scheduleDayForm input,#scheduleDayForm select,#scheduleDayForm button,#scheduleRotationForm input,#scheduleRotationForm button')].map(el=>[el,el.disabled]);controls.forEach(([el])=>el.disabled=true);window.AdminSelects?.sync();$('scheduleStatus').textContent='Сохраняем…';
  // Saving one form must not erase the independent draft in the other form.
  const keepDay=name!=='store_save_upload_day'&&dayDirty?{day:selected,manager:$('scheduleDayManager').value,note:$('scheduleDayNote').value}:null;
  const keepRotation=name!=='store_save_upload_rotation'&&rotationDirty?{start:$('scheduleRotationStart').value,queue:structuredClone(queue)}:null;
  try{
   const saved=await rpc(name,body);if(epoch!==sessionEpoch)return;if(saved?.saved!==true)throw Error('Сервер не подтвердил сохранение расписания.');resetDirty();mutating=false;
   const loaded=await load();if(epoch!==sessionEpoch)return;
   if(keepDay&&selected===keepDay.day){$('scheduleDayManager').value=keepDay.manager;$('scheduleDayNote').value=keepDay.note;dayDirty=dirty=true}
   if(keepRotation){$('scheduleRotationStart').value=keepRotation.start;queue=keepRotation.queue;renderQueue();rotationDirty=dirty=true}
   window.AdminSelects?.sync();$('scheduleStatus').textContent=loaded?'Расписание сохранено.':'Расписание сохранено. Не удалось обновить данные — обновите расписание перед следующей правкой.';
  }
  catch(e){if(epoch===sessionEpoch)$('scheduleStatus').textContent='Не удалось сохранить: '+e.message;}
  finally{if(epoch===sessionEpoch){mutating=false;busy=false;controls.forEach(([el,disabled])=>el.disabled=disabled);window.AdminSelects?.sync();}}
 }
 function onView(view){hide();if(view==='schedule'){$('schedulePanel').classList.remove('hidden');load();}else if(!$('inventoryPanel').classList.contains('hidden'))loadHome();}
 $('scheduleCalendar').onclick=async e=>{const b=e.target.closest('[data-schedule-day]');if(!b||loading||mutating||dayDirty&&!confirm('Перейти без сохранения изменений дня?'))return;const day=b.dataset.scheduleDay,epoch=sessionEpoch;selected=day;dayDirty=false;dirty=rotationDirty;renderCalendar();await renderDay();if(epoch!==sessionEpoch||selected!==day||activeView!=='schedule')return;requestAnimationFrame(()=>{if(epoch!==sessionEpoch||selected!==day||activeView!=='schedule')return;$('scheduleDayTitle').focus({preventScroll:true});$('scheduleDayTitle').scrollIntoView({behavior:'instant',block:'start'});});};
 for(const [id,delta] of [['schedulePrevious',-1],['scheduleNext',1]])$(id).onclick=()=>{if(loading||mutating||!mayDiscard())return;month=shiftMonth(month||monthOf(new Date().toISOString().slice(0,10)),delta);selected=null;load()};
 $('scheduleGoToday').onclick=()=>{if(mutating||!mayDiscard())return;month=null;selected=null;load()};
 $('scheduleRefresh').onclick=()=>{if(mayDiscard())load()};
 $('scheduleManagerFilter').onchange=()=>loadItems();$('scheduleMoreItems').onclick=()=>loadItems(true);
 $('scheduleDayForm').oninput=()=>{dayDirty=dirty=true};$('scheduleRotationForm').oninput=()=>{rotationDirty=dirty=true};
 $('scheduleRotationStart').onchange=()=>{rotationDirty=dirty=true;initQueue()};
 $('scheduleQueue').onchange=e=>{const r=queue.find(r=>r.id===e.target.dataset.queueId);if(r){r.included=e.target.checked;rotationDirty=dirty=true}};
 $('scheduleQueue').onclick=e=>{const b=e.target.closest('[data-queue-move]');if(!b)return;const i=Number(b.dataset.queueMove),j=i+Number(b.dataset.direction);if(j<0||j>=queue.length)return;[queue[i],queue[j]]=[queue[j],queue[i]];rotationDirty=dirty=true;renderQueue();};
 $('scheduleRotationForm').onsubmit=e=>{e.preventDefault();const date=$('scheduleRotationStart').value,ids=queue.filter(r=>r.included).map(r=>r.id);if(!ids.length){$('scheduleStatus').textContent='Выберите хотя бы одного менеджера.';return}mutate(e.submitter,'store_save_upload_rotation',{p_starts_on:date,p_manager_ids:ids,p_revision:data.rotations.find(r=>r.starts_on===date)?.revision||0})};
 $('scheduleDayForm').onsubmit=e=>{e.preventDefault();const d=chosen();if(!d)return;mutate(e.submitter,'store_save_upload_day',{p_day:d.day,p_manager_id:$('scheduleDayManager').value||null,p_note:$('scheduleDayNote').value.trim(),p_revision:d.revision,p_reset:false})};
 $('scheduleDayReset').onclick=e=>{const d=chosen();if(d)mutate(e.currentTarget,'store_save_upload_day',{p_day:d.day,p_manager_id:null,p_note:'',p_revision:d.revision,p_reset:true})};
 $('scheduleItems').onclick=async e=>{const b=e.target.closest('[data-upload-product]');if(!b||busy)return;const id=b.dataset.uploadProduct,epoch=sessionEpoch;b.disabled=true;try{let p=items.find(p=>String(p.id)===id);if(!p)p=(await request(`/rest/v1/products?id=eq.${encodeURIComponent(id)}&select=${ADMIN_FIELDS}`))[0];if(epoch!==sessionEpoch||activeView!=='schedule')return;if(!p)throw Error('Карточка уже удалена');if(!mayDiscard())return;resetDirty();edit(p);}catch(error){if(epoch===sessionEpoch)$('scheduleItemStatus').textContent=error.message}finally{b.disabled=false}};
 function refreshIfNeeded(){if(session&&document.visibilityState!=='hidden'&&!$('inventoryPanel').classList.contains('hidden')&&$('editor').classList.contains('hidden'))loadHome();if(activeView==='schedule'&&session&&document.visibilityState!=='hidden'&&!dirty&&!loading&&!mutating&&Date.now()-lastLoaded>60000)load()}
 root.addEventListener('focus',refreshIfNeeded);setInterval(refreshIfNeeded,60000);
 root.AdminSchedule={...logic,clear,hide,onView,loadHome,mayLeave,hasUnsavedChanges:()=>dirty||mutating,invalidateHome:()=>{homeLoaded=0}};
})(typeof window==='object'?window:globalThis);
