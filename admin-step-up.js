/* UI convenience only. The database independently verifies fresh signed MFA claims. */
(()=>{
 for(const id of ['financePanel','productFinanceCard','teamPanel','financeDialog','commissionDialog','financeLinkDialog']){
  const node=$(id);node.classList.add('sensitive-surface');const lock=document.createElement('div');lock.className='sensitive-lock';
  lock.innerHTML='<p>Для просмотра и изменения этих данных подтвердите доступ.</p><button type="button" data-unlock-sensitive>Ввести код аутентификатора</button>';node.prepend(lock);
 }
 const ttl=15*60;let pending=null,settle=null,verifying=false;
 const dialog=$('stepUpDialog'),form=$('stepUpForm'),error=$('stepUpError');
 function fresh(){
  try{const claims=JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))),now=Date.now()/1000;
   return claims.aal==='aal2'&&Array.isArray(claims.amr)&&claims.amr.some(x=>x.method==='totp'&&typeof x.timestamp==='number'&&x.timestamp>now-ttl&&x.timestamp<=now+30);
  }catch{return false}
 }
 function cancel(){if(settle){settle.reject(Error('Подтверждение отменено. Изменения не отправлены.'));settle=null}dialog.close();form.reset()}
 async function ensure(){
  if(pending)return pending;
  const epoch=sessionEpoch;
  pending=(async()=>{
   const user=await currentAuthUser(),factors=(user.factors||[]).filter(f=>f.status==='verified'&&f.factor_type==='totp');
   if(!factors.length)throw Error('Для этого действия нужен настроенный аутентификатор.');
   if(epoch!==sessionEpoch)throw Error('Сессия завершена.');
   form.reset();form.elements.factor.innerHTML=factors.map(f=>'<option value="'+esc(f.id)+'">'+esc(f.friendly_name||'Аутентификатор')+'</option>').join('');
   form.elements.factor.closest('label').hidden=factors.length<2;error.textContent='';dialog.showModal();form.elements.code.focus();
   await new Promise((resolve,reject)=>{settle={resolve,reject,epoch}});
  })().finally(()=>{pending=null;settle=null;verifying=false;form.querySelector('button[type="submit"]').disabled=false});
  return pending;
 }
 form.onsubmit=async e=>{
  e.preventDefault();if(verifying||!settle)return;const current=settle,code=form.elements.code.value.trim();
  if(!/^\d{6}$/.test(code)){error.textContent='Введите шестизначный код.';return}
  verifying=true;form.querySelector('button[type="submit"]').disabled=true;error.textContent='Проверяем код…';
  try{
   const path='/auth/v1/factors/'+encodeURIComponent(form.elements.factor.value);
   const challenge=await request(path+'/challenge',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
   if(!challenge?.id)throw Error('Не удалось получить проверочный запрос.');
   const data=await request(path+'/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({challenge_id:challenge.id,code})});
   if(current!==settle||current.epoch!==sessionEpoch)throw Error('Сессия завершена.');
   keepSession(data);if(!fresh())throw Error('Сервер не подтвердил свежую проверку. Повторите ввод кода.');
   mask();dialog.close();form.reset();settle=null;current.resolve();
  }catch(e){error.textContent=e.message}finally{form.elements.code.value='';verifying=false;form.querySelector('button[type="submit"]').disabled=false}
 };
 $('cancelStepUp').onclick=()=>{if(!verifying)cancel()};
 dialog.addEventListener('cancel',e=>{e.preventDefault();if(!verifying)cancel()});
 function mask(){const stale=Boolean(session)&&!fresh();document.body.classList.toggle('mfa-stale',stale);document.querySelectorAll('.sensitive-surface > :not(.sensitive-lock)').forEach(el=>el.inert=stale)}
 document.addEventListener('visibilitychange',mask);window.addEventListener('focus',mask);setInterval(mask,1000);
 document.addEventListener('click',e=>{if(e.target.closest('[data-unlock-sensitive]'))ensure().catch(e=>status(e.message))});
 window.AdminStepUp={ensure,cancel,fresh};mask();
})();
