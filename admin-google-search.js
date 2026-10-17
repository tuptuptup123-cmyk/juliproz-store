/* Google Search Console reports use the existing protected admin transport. */
(()=>{
 const panel=$('googleSearchPanel');if(!panel)return;
 const CONSOLE='https://search.google.com/search-console/performance/search-analytics?resource_id=https%3A%2F%2Fwww.juliproz.com%2F';
 let report=null,metric='clicks',table='queries',generation=0,controller=null,lastLoaded=0,loadedDays=null;
 const number=(value,digits=0)=>value==null?'—':new Intl.NumberFormat('ru-RU',{maximumFractionDigits:digits}).format(value);
 const date=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')?new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z')):'—';
 const countryCodes={rus:'RU',usa:'US',gbr:'GB',are:'AE',tha:'TH',sgp:'SG',fra:'FR',ita:'IT',deu:'DE',esp:'ES',prt:'PT',pol:'PL',ukr:'UA',kaz:'KZ',blr:'BY',geo:'GE',arm:'AM',tur:'TR',chn:'CN',hkg:'HK',jpn:'JP',kor:'KR',can:'CA',aus:'AU',nld:'NL',che:'CH',aut:'AT',cze:'CZ',cyp:'CY',isr:'IL',ind:'IN',idn:'ID',vnm:'VN',bra:'BR',mex:'MX',sau:'SA',qat:'QA'};
 function country(key){try{return new Intl.DisplayNames(['ru'],{type:'region'}).of(countryCodes[key.toLowerCase()]||key.toUpperCase())}catch{return key.toUpperCase()}}
 panel.innerHTML=`<div class="google-heading"><div><span class="eyebrow">ОРГАНИЧЕСКИЙ ПОИСК</span><h2>Как вас находят в Google</h2><p class="dashboard-note">Русская и английская версии · весь мир</p></div><div class="google-toolbar"><label><span class="sr-only">Период Google</span><select id="googleSearchDays"><option value="1">Вчера</option><option value="7">7 дней</option><option value="28" selected>28 дней</option><option value="90">90 дней</option></select></label><button id="googleSearchRefresh" type="button">Обновить</button></div></div><p id="googleSearchStatus" class="dashboard-note" role="status" aria-live="polite"></p><div id="googleSearchContent"></div><div class="google-footer"><p class="dashboard-note">Google публикует данные с задержкой. Дни отчёта считаются по тихоокеанскому времени США (PT). Переходы из поиска не равны посетителям или продажам.</p><a href="${CONSOLE}" target="_blank" rel="noopener noreferrer">Открыть Search Console ↗</a></div>`;
 const content=$('googleSearchContent'),status=$('googleSearchStatus');
 function change(key,current,previous){
  if(!previous||current?.[key]==null||previous[key]==null)return '<small>Нет данных для сравнения</small>';
  const delta=current[key]-previous[key];
  let text;if(key==='ctr')text=number(Math.abs(delta)*100,1)+' п. п.';else if(key==='position')text=number(Math.abs(delta),1);else if(previous[key]===0)return '<small>В прошлом периоде — 0</small>';else text=number(Math.abs(delta)/previous[key]*100,1)+'%';
  const good=key==='position'?delta<0:delta>0;
  return `<small class="${delta===0?'':good?'google-positive':'google-negative'}">${delta===0?'Без изменений':(delta>0?'+':'−')+text} <span>к прошлому периоду</span></small>`;
 }
 function cards(){return `<div class="google-metrics">${[['clicks','Переходы','Сколько раз открыли сайт из поиска'],['impressions','Показы','Сколько раз сайт появился в результатах'],['ctr','CTR','Доля показов, которые привели к переходу'],['position','Средняя позиция','Чем меньше число, тем выше результат']].map(([key,label,help])=>`<article class="google-metric"><span title="${help}">${label}</span><strong>${key==='ctr'&&report.totals?number(report.totals.ctr*100,1)+'%':number(report.totals?.[key],key==='position'?1:0)}</strong>${change(key,report.totals,report.previous)}</article>`).join('')}</div>`}
 function chart(){
  const daily=report.daily||[],values=daily.map(row=>Number(row[metric])||0),max=Math.max(1,...values),width=720,height=140;
  const first=Date.parse(daily[0]?.key),last=Date.parse(daily.at(-1)?.key),span=last-first;
  const series=daily.map(row=>({x:span>0?12+(Date.parse(row.key)-first)/span*(width-24):width/2,y:height-12-(Number(row[metric])||0)/max*(height-28),row}));
  const label=metric==='clicks'?'Переходы':'Показы';
  const line=series.map(point=>point.x.toFixed(2)+','+point.y.toFixed(2)).join(' ');
  return `<section class="dashboard-card google-chart"><div class="dashboard-card-heading"><div><h3>Динамика по дням</h3><p class="dashboard-note">${date(report.period.start)} — ${date(report.period.end)}</p></div><div class="chart-tabs" role="group" aria-label="Показатель Google"><button type="button" data-google-metric="clicks" aria-pressed="${metric==='clicks'}">Переходы</button><button type="button" data-google-metric="impressions" aria-pressed="${metric==='impressions'}">Показы</button></div></div>${series.length?`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${label} по дням"><title>${label} по дням</title><path d="M12 ${height-12}H${width-12}" class="google-axis"/><polyline points="${line}" class="google-line"/>${series.map(point=>`<circle cx="${point.x}" cy="${point.y}" r="3" class="google-point"><title>${date(point.row.key)}: ${number(point.row[metric])}</title></circle>`).join('')}</svg><div class="google-axis-labels"><span>${date(daily[0].key)}</span><span>${date(daily.at(-1).key)}</span></div><details class="google-daily"><summary>Данные по дням</summary>${dataTable(daily,'Дата','daily')}</details>`:'<p class="google-empty">Google пока не вернул данные по дням.</p>'}</section>`;
 }
 function pageLink(key){
  try{const url=new URL(key);if(url.origin!=='https://www.juliproz.com'||url.username||url.password)return esc(key);let label;try{label=decodeURIComponent(url.pathname+url.search)}catch{label=url.pathname+url.search}return `<a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">${esc(label||'/')} ↗</a>`}catch{return esc(key)}
 }
 function dataTable(rows,label,kind){
  if(!rows?.length)return '<p class="google-empty">Google пока не вернул данные для этого списка.</p>';
  return `<div class="google-table-scroll" tabindex="0" role="region" aria-label="${label}"><table class="google-table"><thead><tr><th scope="col">${label}</th><th scope="col">Переходы</th><th scope="col">Показы</th><th scope="col">CTR</th><th scope="col">Позиция</th></tr></thead><tbody>${rows.map(row=>`<tr><th scope="row">${kind==='pages'?pageLink(row.key):esc(kind==='countries'?country(row.key):kind==='daily'?date(row.key):row.key)}</th><td>${number(row.clicks)}</td><td>${number(row.impressions)}</td><td>${number(row.ctr*100,1)}%</td><td>${number(row.position,1)}</td></tr>`).join('')}</tbody></table></div>`;
 }
 function tables(){return `<section class="dashboard-card google-lists"><div class="dashboard-card-heading"><h3>Что приводит покупателей</h3><div class="chart-tabs" role="group" aria-label="Разбивка Google">${[['queries','Запросы'],['pages','Страницы'],['countries','Страны']].map(([key,label])=>`<button type="button" data-google-table="${key}" aria-pressed="${table===key}">${label}</button>`).join('')}</div></div>${dataTable(report[table],{queries:'Запрос',pages:'Страница',countries:'Страна'}[table],table)}<p class="dashboard-note">До 10 результатов по числу переходов. Google скрывает часть запросов; сумма строк может отличаться от общих показателей.</p></section>`}
 function render(){
  if(!report||report.status==='not_connected')return;
  content.innerHTML=cards()+(report.status==='empty'?'<div class="google-empty"><strong>Google пока не вернул статистику за этот период.</strong><p>Для недавно подключённого сайта это ожидаемо. Попробуйте другой период или проверьте отчёт позже.</p></div>':chart()+tables());
 }
 async function load(force=false){
  if(!session)return;const days=Number($('googleSearchDays').value);
  if(!force&&report&&loadedDays===days&&Date.now()-lastLoaded<15*60000)return;
  controller?.abort();controller=new AbortController();const run=++generation,epoch=sessionEpoch;
  report=null;content.innerHTML='';status.textContent='Загружаем статистику Google…';panel.setAttribute('aria-busy','true');$('googleSearchRefresh').disabled=true;
  try{
   const result=await request('/reports/google-search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({days}),signal:controller.signal});
   if(run!==generation||epoch!==sessionEpoch||!session)return;
   if(!['not_connected','ready','empty'].includes(result?.status))throw Error('Не удалось получить отчёт Google.');
   report=result;loadedDays=days;lastLoaded=Date.now();
   if(result.status==='not_connected'){
    status.textContent='Ожидаем подключения автоматической статистики.';
    content.innerHTML='<div class="google-empty google-connect"><strong>Отчёт готов к подключению</strong><p>Владельцу нужно разрешить админке чтение статистики Google Search Console. После подключения здесь появятся показы, переходы, запросы и страницы.</p><p>Пока статистику можно посмотреть по ссылке ниже.</p></div>';return;
   }
   const updated=new Date(result.updatedAt);
   status.textContent=`${date(result.period.start)} — ${date(result.period.end)} · Получено ${updated.toLocaleString('ru-RU')}${result.lastDataDate?' · Данные по '+date(result.lastDataDate):''}${result.firstIncompleteDate?' · С '+date(result.firstIncompleteDate)+' данные предварительные.':'.'} Обновление — не чаще раза в 15 минут.`;
   render();
  }catch(error){if(run!==generation||epoch!==sessionEpoch||error.name==='AbortError')return;status.textContent=error.message||'Не удалось загрузить Google. Попробуйте позже.';content.innerHTML='<p class="google-empty">Отчёт недоступен. Нажмите «Обновить», чтобы повторить.</p>'}
  finally{if(run===generation){panel.removeAttribute('aria-busy');$('googleSearchRefresh').disabled=false;controller=null}}
 }
 panel.addEventListener('click',event=>{
  const control=event.target.closest('[data-google-metric],[data-google-table]');if(!control||!report)return;
  if(control.dataset.googleMetric&&['clicks','impressions'].includes(control.dataset.googleMetric))metric=control.dataset.googleMetric;
  if(control.dataset.googleTable&&['queries','pages','countries'].includes(control.dataset.googleTable))table=control.dataset.googleTable;
  const attribute=control.hasAttribute('data-google-metric')?'data-google-metric':'data-google-table',value=control.getAttribute(attribute);render();panel.querySelector(`[${attribute}="${value}"]`)?.focus({preventScroll:true});
 });
 $('googleSearchDays').addEventListener('change',()=>load(true));$('googleSearchRefresh').addEventListener('click',()=>load(true));
 window.AdminGoogleSearch={load,clear(){generation++;controller?.abort();controller=null;report=null;lastLoaded=0;loadedDays=null;metric='clicks';table='queries';content.innerHTML='';status.textContent='';panel.removeAttribute('aria-busy');$('googleSearchRefresh').disabled=false;$('googleSearchDays').value='28'}};
})();
