/* Owner-only monthly summary; financial values never enter browser storage. */
(()=>{
 const money=n=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'EUR',minimumFractionDigits:0,maximumFractionDigits:2}).format(n);
 const percent=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(n)+'%';
 const progress=(profit,target)=>target>0&&profit!=null?Math.min(100,Math.max(0,Math.round(profit/target*10000)/100)):0;
 if(typeof module==='object'&&module.exports)module.exports={progress};
 if(typeof window==='undefined')return;
 const panel=$('homeBusiness'),form=$('businessCapitalForm'),dialog=$('businessCapitalDialog');
 let data=null,requestId=0,loading=false,saving=false,draft=null,loadedAt=0;
 const rpc=(name,body={})=>request('/rest/v1/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const visible=()=>canViewStatistics()&&!$('inventoryPanel').classList.contains('hidden')&&$('editor').classList.contains('hidden');
 const fresh=()=>window.AdminStepUp?.fresh()===true;
 const monthLabel=month=>new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(month+'T12:00:00Z'));
 function resetValues(){data=null;loadedAt=0;$('businessMetrics').innerHTML='';$('businessGoal').innerHTML='';$('businessContent').classList.add('hidden')}
 function clear(){requestId++;loading=false;saving=false;draft=null;resetValues();dialog.close();form.reset();$('businessCapitalError').textContent='';$('businessStatus').textContent='';form.elements.capital.disabled=false;$('businessCapitalSave').disabled=false;panel.classList.add('hidden')}
 function render(){
  const {inventory:i,sales:s,capital:c,goal:g}=data;
  $('businessTitle').textContent='Финансы · '+monthLabel(data.month);
  const stockValue=i.cards>0&&i.price_missing>=i.cards?'Цена не заполнена':(i.price_missing?'от ':'')+money(i.catalogue_value);
  const card=(label,value,note)=>`<article class="business-metric"><h3>${esc(label)}</h3><strong>${esc(value)}</strong><p>${esc(note)}</p></article>`;
  const missing=s.profit_missing>0;
  $('businessMetrics').innerHTML=card('Наличие по ценам продажи',stockValue,`${i.units} шт. · свои: ${money(i.own_value)} · комиссия: ${money(i.commission_value)}${i.price_missing?' · без цены: '+i.price_missing:''}`)+
   card('Продано за месяц',money(s.revenue),`${s.sold_units} шт. · ${s.sold_count} завершённых сделок`)+
   card('Прибыль по сделкам',missing?'Нужны данные':money(s.profit),missing?`Не заполнены закупка, выплата владельцу или расходы по ${s.profit_missing} сделкам.`:'После закупки, выплат владельцам и расходов по сделкам.');
  let status='Укажите вложенный капитал, чтобы увидеть цель в евро.';
  if(c.invested_capital!=null){
   if(missing)status='Прогресс появится после заполнения финансов всех продаж за месяц.';
   else if(s.profit<0)status='Убыток за месяц: '+money(-s.profit)+'.';
   else if(s.profit>=g.stretch)status='Цель 20% достигнута.';
   else if(s.profit>=g.minimum)status='Цель 10% достигнута. До 20% осталось '+money(g.stretch-s.profit)+'.';
   else status='До цели 10% осталось '+money(g.minimum-s.profit)+'.';
  }
  $('businessGoal').innerHTML=`<div class="business-goal-heading"><div><span class="business-eyebrow">ЦЕЛЬ МЕСЯЦА</span><h3>Заработать 10–20% от вложений</h3><p>Вложенный капитал: <strong>${c.invested_capital==null?'не указан':esc(money(c.invested_capital))}</strong></p></div><button type="button" id="businessCapitalEdit">${c.invested_capital==null?'Указать капитал':'Изменить капитал'}</button></div>
   <div class="business-targets"><div><span>Цель 10%</span><strong>${g.minimum==null?'—':esc(money(g.minimum))}</strong></div><div><span>Цель 20%</span><strong>${g.stretch==null?'—':esc(money(g.stretch))}</strong></div><div><span>Заработано от вложений</span><strong>${g.return_percent==null?'—':esc(percent(g.return_percent))}</strong></div></div>
   <div class="business-progress"><progress max="100" value="${progress(s.profit,g.stretch)}" aria-label="Прогресс к цели 20%"${g.return_percent==null?' hidden':''}></progress><p>${esc(status)}</p></div>
   <details class="business-explanation"><summary>Как считаются суммы</summary><p>Наличие — свои и комиссионные вещи по ценам продажи с учётом количества, включая бронь и скрытые карточки. Проданные вещи, старый архив и товары под заказ сюда не входят. Это стоимость товаров, а не вложенный капитал.</p><p>Продажи — фактические суммы завершённых сделок с ${esc(data.month.split('-').reverse().join('.'))} по ${esc(data.through.split('-').reverse().join('.'))}. Отменённые и связанные повторно заказы исключены. ${Number(data.legacy_count)||0} карточек старого архива не учитываются без подтверждённой продажи. Период — по времени Киева.</p><p>Прибыль = фактическая продажа − закупка или выплата владельцу − расходы по сделке. Общие расходы бизнеса отдельно не вычитаются. Неизвестные затраты не считаются нулём.</p><p>Вложенный капитал задаётся главным администратором для каждого месяца и не уменьшается автоматически после продажи. При пополнении вложений можно изменить сумму. Цель — ориентир по прибыли, а не по выручке или полученным оплатам.</p></details>`;
  $('businessContent').classList.remove('hidden');$('businessStatus').textContent='Обновлено '+new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
 }
 async function load(force=false){
  if(!visible()){panel.classList.add('hidden');return}
  panel.classList.remove('hidden');
  if(!fresh()){resetValues();return}
  if(loading||saving||!force&&Date.now()-loadedAt<60000&&data?.month===BusinessDate.today().slice(0,7)+'-01')return;
  const id=++requestId,epoch=sessionEpoch;loading=true;$('businessStatus').textContent='Загружаем финансовые показатели…';
  try{
   const result=await rpc('store_business_overview');
   if(id!==requestId||epoch!==sessionEpoch||!canViewStatistics()||!fresh())return;
   if(!result?.inventory||!result?.sales||!result?.capital||!result?.goal||!/^\d{4}-\d{2}-01$/.test(result.month))throw Error('Некорректный ответ сервера');
   data=result;loadedAt=Date.now();render();
  }catch(error){if(id===requestId&&epoch===sessionEpoch&&canViewStatistics()){resetValues();$('businessStatus').textContent='Не удалось загрузить финансы. Нажмите «Обновить».'}}
  finally{if(id===requestId)loading=false}
 }
 function onView(){if(visible())load(true);else panel.classList.add('hidden')}
 function close(){if(saving)return;dialog.close();draft=null;form.reset();$('businessCapitalError').textContent=''}
 $('businessCapitalCancel').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close()});
 $('businessGoal').onclick=e=>{
  if(!e.target.closest('#businessCapitalEdit')||!data||!canViewStatistics()||!fresh()||saving)return;
  draft={...data.capital,month:data.month};form.reset();form.elements.capital.value=draft.invested_capital??'';
  $('businessCapitalMonth').textContent=monthLabel(draft.month);$('businessCapitalError').textContent='';dialog.showModal();form.elements.capital.focus();
 };
 form.onsubmit=async e=>{
  e.preventDefault();if(saving||!draft||!canViewStatistics())return;
  const value=Number(form.elements.capital.value);if(!Number.isSafeInteger(value)||value<1||value>999999999){$('businessCapitalError').textContent='Введите сумму от 1 до 999 999 999 EUR без копеек.';return}
  const current=draft,epoch=sessionEpoch;saving=true;form.elements.capital.disabled=true;$('businessCapitalSave').disabled=true;$('businessCapitalError').textContent='Сохраняем…';
  try{
   const saved=await rpc('store_save_monthly_capital',{p_month:current.month,p_revision:current.revision,p_capital:value});
   if(epoch!==sessionEpoch||draft!==current||!canViewStatistics())return;
   if(saved?.month!==current.month||Number(saved.revision)!==Number(current.revision)+1)throw Error('Сервер не подтвердил запись.');
   dialog.close();draft=null;form.reset();loadedAt=0;
  }catch(error){if(epoch===sessionEpoch&&draft===current)$('businessCapitalError').textContent=error.message+' Закройте форму и обновите показатели перед повторной попыткой.'}
  finally{if(epoch===sessionEpoch){saving=false;form.elements.capital.disabled=false;$('businessCapitalSave').disabled=false;if(!draft)await load(true)}}
 };
 $('businessRefresh').onclick=()=>load(true);
 $('businessUnlock').onclick=async()=>{try{await AdminStepUp.ensure();await load(true)}catch(error){status(error.message)}};
 window.AdminBusiness={clear,onView,load,invalidate(){loadedAt=0;load(true)}};
 window.addEventListener('focus',()=>load());document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')load()});
 setInterval(()=>{if(!canViewStatistics()){clear();return}if(!fresh()){requestId++;loading=false;resetValues();return}if(document.visibilityState==='visible')load()},60000);
})();
