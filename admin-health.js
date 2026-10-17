(()=>{
 let pending=false,timer,lastFetch=0;const notice=document.createElement('div');notice.id='operationalNotice';notice.className='operational-notice hidden';notice.setAttribute('role','status');
 $('workspace').prepend(notice);
 const panel=document.createElement('section');panel.className='dashboard-card operational-health';panel.innerHTML='<h2>Работа сайта и бота</h2><p class="dashboard-note">Доставка ответов бота и технические ошибки браузеров за 24 часа.</p><div id="operationalDetails"></div>';$('analyticsPanel').append(panel);
 async function refresh(){
  if(!session||document.visibilityState==='hidden'||pending||Date.now()-lastFetch<60000||$('workspace').classList.contains('hidden'))return;pending=true;lastFetch=Date.now();
  try{const epoch=sessionEpoch,data=await request('/rest/v1/rpc/store_operational_health',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(epoch!==sessionEpoch)return;
   const bot=data.bot||{},errors=Array.isArray(data.error_alerts)?data.error_alerts:[],count=Number(data.errors_24h)||0,alert=Number(bot.failed_24h)>0||Number(bot.overdue)>0||errors.some(x=>Number(x.hits)>=5);
   notice.classList.toggle('hidden',!alert);notice.innerHTML=alert?'<span>Есть сбои, требующие внимания: '+(Number(bot.failed_24h)||0)+' неотправленных ответов бота, '+count+' ошибок браузера.</span><button type="button">Посмотреть</button>':'';
   notice.querySelector('button')?.addEventListener('click',()=>{selectView('analytics');panel.scrollIntoView({block:'center'})});
   $('operationalDetails').innerHTML='<p>Бот: доставлено <b>'+Number(bot.delivered_24h||0)+'</b> · в очереди <b>'+Number(bot.pending||0)+'</b> · ошибка <b>'+Number(bot.failed_24h||0)+'</b></p><p>Ошибок браузера: <b>'+count+'</b></p>'+(errors.length?'<div class="analytics-table-wrap"><table class="analytics-table"><thead><tr><th>Где</th><th>Ошибка</th><th>Файл</th><th>Событий</th><th>Последняя</th></tr></thead><tbody>'+errors.map(x=>'<tr><td>'+esc({website:'Сайт',telegram:'Mini App',admin:'Админка'}[x.surface]||x.surface)+'</td><td>'+esc(x.kind)+'</td><td>'+esc(x.asset)+':'+Number(x.line_no)+'<br><small>'+esc(x.release?.slice(0,7))+'</small></td><td>'+Number(x.hits)+'</td><td>'+esc(new Date(x.last_seen).toLocaleString('ru-RU'))+'</td></tr>').join('')+'</tbody></table></div>':'<p class="dashboard-note">За период технических ошибок не зарегистрировано.</p>')+'<p class="dashboard-note">Здесь нет текстов сообщений и личных данных посетителей. Считаются события, а не люди. Ошибки хранятся 30 дней; статусы ответов бота — 7 дней. Повторы доставки возможны, если Telegram принял ответ, но не подтвердил его из-за обрыва связи.</p>';
  }catch{if(session)$('operationalDetails').textContent='Не удалось загрузить состояние. Повторим автоматически.'}finally{pending=false}
 }
 timer=setInterval(refresh,60000);document.addEventListener('visibilitychange',refresh);document.addEventListener('click',()=>setTimeout(refresh,250));
 window.AdminHealth={refresh,clear(){lastFetch=0;notice.classList.add('hidden');notice.textContent='';$('operationalDetails').textContent=''}};
})();
