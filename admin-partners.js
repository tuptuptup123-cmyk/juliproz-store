/* Account-bound workspace: records are loaded only through protected RPCs. */
(()=>{
 const panel=$('partnersPanel'),dialog=$('partnerDialog');if(!panel||!dialog)return;
 const statuses=['Не связывались','На проверке','Связались','Переговоры','Тестовый заказ','Партнёр','Отказ','Отложено'];
 let rows=[],generation=0,view='all',layout='cards',tag='Все',selected=null,dirty=false,saving=false;
 const rpc=(name,body={})=>request('/rest/v1/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const allowed=()=>Boolean(session&&adminSecurity.owner&&!adminSecurity.pending);
 const normalize=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 function safeLink(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}}
 function message(text){$('partnersStatus').textContent=text}
 function clear(){generation++;rows=[];selected=null;dirty=false;saving=false;$("partnerFields").disabled=false;dialog.close();$('partnerDetail').replaceChildren();$('partnerSaveError').textContent='';$('partnersGrid').replaceChildren();$('partnersCount').textContent='';$('partnersSearch').value='';$('partnersGeo').value='';$('partnersFilterStatus').value='';$('partnersTotal').textContent='—';$('partnersPriority').textContent='—';$('partnersFavorites').textContent='—';panel.classList.add('hidden');view='all';tag='Все';message('')}
 function mayLeave(){if(saving){$('partnerSaveError').textContent='Дождитесь завершения сохранения.';return false}if(dirty&&!confirm('Закрыть карточку без сохранения изменений?'))return false;dirty=false;dialog.close();return true}
 function hide(){panel.classList.add('hidden');dialog.close()}
 function onView(next){hide();if(next==='partners'&&allowed()){panel.classList.remove('hidden');load()}}
 function geography(row,value){if(!value)return true;if(value==='Европа')return /Франция|Монако|Испания|Бельгия|Лондон|Париж|Европа/.test(row.geography);if(value==='Азия')return /Сингапур|Япония|Гонконг|Дубай/.test(row.geography);if(value==='США')return /Нью-Йорк|Майами/.test(row.geography);return /Международ|международ/.test(row.geography)}
 function render(){
  const query=normalize($('partnersSearch').value).trim(),status=$('partnersFilterStatus').value,geo=$('partnersGeo').value;
  const filtered=rows.filter(r=>{const text=normalize([r.name,r.geography,r.category,r.facts].join(' '));return (!query||text.includes(query))&&(!status||r.status===status)&&geography(r,geo)&&(view!=='priority'||r.priority==='A')&&(view!=='favorites'||r.favorite)&&(view!=='active'||['На проверке','Связались','Переговоры','Тестовый заказ','Партнёр'].includes(r.status))&&(tag==='Все'||(tag==='Sale / outlet'?/sale|outlet|мультибренд/.test(text):text.includes(normalize(tag))))});
  panel.querySelectorAll('[data-partner-view]').forEach(b=>{const active=b.dataset.partnerView===view;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});
  panel.querySelectorAll('[data-partner-tag]').forEach(b=>{const active=b.dataset.partnerTag===tag;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});
  $('partnersTotal').textContent=rows.length;$('partnersPriority').textContent=rows.filter(r=>r.priority==='A').length;$('partnersFavorites').textContent=rows.filter(r=>r.favorite).length;
  $('partnersCount').textContent='Показано '+filtered.length+' из '+rows.length+' компаний';
  panel.querySelectorAll('[data-partner-layout]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.partnerLayout===layout)));
  $('partnersGrid').classList.toggle('partner-table-mode',layout==='table');
  if(layout==='table'&&filtered.length){
   $('partnersGrid').innerHTML='<div class="partner-table-scroll" role="region" aria-label="Таблица партнёров — прокрутка по горизонтали" tabindex="0"><table class="partner-table"><caption class="partner-sr-only">Компании и потенциальные партнёры JULI.PROZ</caption><thead><tr><th scope="col">Избранное</th><th scope="col">Компания</th><th scope="col">География</th><th scope="col">Направление</th><th scope="col">Приоритет</th><th scope="col">Статус</th><th scope="col">Контакт</th><th scope="col">Мои заметки</th></tr></thead><tbody>'+filtered.map(r=>'<tr><td><button type="button" class="partner-table-star" data-partner-star="'+esc(r.id)+'" aria-label="'+(r.favorite?'Убрать из избранного':'В избранное')+' — '+esc(r.name)+'" aria-pressed="'+r.favorite+'">'+(r.favorite?'★':'☆')+'</button></td><th scope="row"><button type="button" class="partner-table-open" data-partner-open="'+esc(r.id)+'" aria-label="Открыть '+esc(r.name)+'">'+esc(r.name)+'<span aria-hidden="true"> ↗</span></button></th><td>'+esc(r.geography)+'</td><td>'+esc(r.category)+'</td><td><span class="partner-pill '+(r.priority==='A'?'priority':'')+'">'+(r.priority==='A'?'Первая очередь':r.priority==='B'?'Потенциальный партнёр':'Изучить возможности')+'</span></td><td>'+esc(r.status)+'</td><td class="partner-table-contact">'+contactMarkup(r)+'</td><td><span class="partner-table-notes">'+esc(r.notes||'—')+'</span></td></tr>').join('')+'</tbody></table></div>';return;
  }
  $('partnersGrid').innerHTML=filtered.map(r=>'<article class="partner-card"><button class="partner-open" data-partner-open="'+esc(r.id)+'" aria-label="Открыть '+esc(r.name)+'"><span class="partner-card-top"><span class="partner-monogram" aria-hidden="true">'+esc(r.name.split(' ').filter(w=>w.toLowerCase()!=='the').map(w=>w[0]).slice(0,2).join(''))+'</span><span><strong>'+esc(r.name)+'</strong><small>'+esc(r.geography)+'</small></span></span><span class="partner-category">'+esc(r.category)+'</span><span class="partner-description">'+esc(r.facts)+'</span><span class="partner-card-foot"><span class="partner-pill '+(r.priority==='A'?'priority':'')+'">'+(r.priority==='A'?'Первая очередь':r.priority==='B'?'Потенциальный партнёр':'Изучить возможности')+'</span><span>Подробнее ↗</span></span><span class="partner-state">'+esc(r.status)+'</span></button><button type="button" class="partner-star" data-partner-star="'+esc(r.id)+'" aria-label="'+(r.favorite?'Убрать из избранного':'В избранное')+' — '+esc(r.name)+'" aria-pressed="'+r.favorite+'">'+(r.favorite?'★':'☆')+'</button></article>').join('')||'<div class="partner-empty">Нет компаний с такими параметрами.<br><button id="partnersReset" type="button">Сбросить фильтры</button></div>';
 }
 async function load(){
  if(!allowed())return;const epoch=sessionEpoch,id=++generation;message('Загружаем компании…');$('partnersRefresh').disabled=true;
  try{const data=await rpc('store_partner_list');if(id!==generation||epoch!==sessionEpoch||!allowed())return;if(!Array.isArray(data))throw Error('Некорректный ответ сервера');rows=data;render();message('')}
  catch(e){if(id===generation&&epoch===sessionEpoch){if(e.httpStatus===403||e.code==='42501'){rows=[];render()}message('Не удалось загрузить базу: '+e.message)}}
  finally{if(id===generation)$('partnersRefresh').disabled=false}
 }
 function contactMarkup(r){
  const email=r.contact.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),number=r.contact.match(/(?:WhatsApp\s*)?(\+\d[\d\s()-]+)/);
  if(email)return '<a href="mailto:'+esc(email[0])+'">'+esc(r.contact)+'</a>';
  if(number){const digits=number[1].replace(/\D/g,'');return '<a href="'+(r.contact.startsWith('WhatsApp')?'https://wa.me/'+digits:'tel:+'+digits)+'" target="_blank" rel="noopener noreferrer">'+esc(r.contact)+'</a>'}
  return esc(r.contact);
 }
 function open(id){
  const row=rows.find(r=>r.id===id);if(!row||!allowed())return;selected=row;dirty=false;$('partnerSaveError').textContent='';
  const link=safeLink(row.source_url);
  $('partnerDetail').innerHTML='<span class="partner-pill">'+esc(row.category)+'</span><h2 id="partnerDetailTitle">'+esc(row.name)+'</h2><p class="muted">'+esc(row.geography)+'</p><div class="partner-links">'+(link?'<a class="primary" href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">Открыть сайт ↗</a>':'')+'</div><div class="partner-block"><h3>Что мы знаем</h3><p>'+esc(row.facts)+'</p><div class="partner-contact">'+contactMarkup(row)+'</div></div><div class="partner-block partner-idea"><h3>Идея для JULI.PROZ</h3><p>'+esc(row.idea)+'</p><small>Предложение для обсуждения, не подтверждённая договорённость.</small></div><div class="partner-block"><label>Статус общения<select id="partnerEditStatus">'+statuses.map(s=>'<option '+(s===row.status?'selected':'')+'>'+esc(s)+'</option>').join('')+'</select></label><label class="partner-favorite-label"><input id="partnerEditFavorite" type="checkbox" '+(row.favorite?'checked':'')+'> В избранном</label><label>Мои заметки<textarea id="partnerEditNotes" rows="5" maxlength="10000" placeholder="Условия, договорённости, следующий шаг…">'+esc(row.notes)+'</textarea></label></div><details class="partner-block"><summary>Что изучить для SEO</summary><p>Изучить описание услуг, категории и путь к заявке. Полезные приёмы можно применить на существующих страницах JULI.PROZ.</p><small>Частотность запросов и позиции этой компании в Google не измерены.</small></details><div class="partner-block"><h3>Источник · '+esc(row.checked_on)+'</h3>'+(link?'<a class="partner-source" href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">'+esc(link)+'</a>':'')+'<p class="muted">Надёжность компании и условия сделки требуют отдельной проверки.</p></div>';
  $('partnerDetail').oninput=()=>{dirty=true};$('partnerDetail').onchange=()=>{dirty=true};$('partnerSave').disabled=false;dialog.showModal();$('partnerClose').focus();
 }
 async function update(row,patch){
  const epoch=sessionEpoch;const result=await rpc('store_partner_update',{p_id:row.id,p_revision:row.revision,p_status:patch.status??row.status,p_favorite:patch.favorite??row.favorite,p_notes:patch.notes??row.notes});
  if(epoch!==sessionEpoch||!allowed())return null;
  if(!result||result.id!==row.id)throw Error('Не удалось подтвердить сохранение');
  rows=rows.map(r=>r.id===result.id?result:r);render();return result;
 }
 $('partnerForm').onsubmit=async event=>{
  event.preventDefault();if(!selected||saving||!allowed())return;
  const row=selected,epoch=sessionEpoch;saving=true;$('partnerSave').disabled=true;$('partnerSaveError').textContent='Сохраняем…';
  const patch={status:$('partnerEditStatus').value,favorite:$('partnerEditFavorite').checked,notes:$('partnerEditNotes').value};
  $('partnerFields').disabled=true;
  try{const result=await update(row,patch);if(!result||epoch!==sessionEpoch)return;selected=result;dirty=false;dialog.close();message('Изменения сохранены.')}
  catch(e){if(epoch===sessionEpoch)$('partnerSaveError').textContent='Не сохранено: '+e.message}
  finally{if(epoch===sessionEpoch){saving=false;$('partnerFields').disabled=false;$('partnerSave').disabled=false}}
 };
 $('partnersGrid').onclick=async event=>{
  const card=event.target.closest('[data-partner-open]');if(card){open(card.dataset.partnerOpen);return}
  const star=event.target.closest('[data-partner-star]');
  if(star){const row=rows.find(r=>r.id===star.dataset.partnerStar);if(!row||star.disabled)return;star.disabled=true;const epoch=sessionEpoch;try{if(await update(row,{favorite:!row.favorite}))message('Избранное обновлено.')}catch(e){if(epoch===sessionEpoch)message('Не сохранено: '+e.message)}finally{star.disabled=false}}
  if(event.target.id==='partnersReset'){view='all';tag='Все';$('partnersSearch').value='';$('partnersGeo').value='';$('partnersFilterStatus').value='';render()}
 };
 panel.querySelectorAll('[data-partner-layout]').forEach(b=>b.onclick=()=>{layout=b.dataset.partnerLayout;render()});
 panel.querySelectorAll('[data-partner-view]').forEach(b=>b.onclick=()=>{view=b.dataset.partnerView;render()});
 panel.querySelectorAll('[data-partner-tag]').forEach(b=>b.onclick=()=>{tag=b.dataset.partnerTag;render()});
 $('partnersSearch').oninput=render;$('partnersGeo').onchange=render;$('partnersFilterStatus').onchange=render;
 $('partnersRefresh').onclick=load;$('partnerClose').onclick=mayLeave;
 dialog.addEventListener('cancel',event=>{event.preventDefault();mayLeave()});
 window.addEventListener('beforeunload',event=>{if(dirty||saving){event.preventDefault();event.returnValue=''}});
 window.AdminPartners={clear,hide,onView,mayLeave};
})();
