/* Owner-only product costs and actual sales. Never put these values in products. */
(()=>{
 const rpc=(name,body)=>request('/rest/v1/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const money=n=>n==null?'Не заполнено':new Intl.NumberFormat('ru-RU',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(n));
 const amount=v=>{if(String(v).trim()==='')return null;const n=Number(v);if(!Number.isSafeInteger(n)||n<0||n>999999999)throw Error('Закупка и расходы: целые суммы от 0 до 999 999 999 EUR.');return n};
 let state=null,requestId=0;
 const fields=()=>[$('productPurchaseCost'),$('productUnitExpenses')];
 function clear(){requestId++;state=null;$('productFinanceCard').classList.add('hidden');fields().forEach(f=>{f.value='';f.disabled=true});for(const id of ['productFinanceStatus','productFinanceSummary','productFinanceSales'])$(id).textContent='';$('productFinanceMore').classList.add('hidden');$('productFinanceRetry').classList.add('hidden')}
 function values(){return {purchase_per_unit:amount($('productPurchaseCost').value),expenses_per_unit:amount($('productUnitExpenses').value)}}
 function sync(){if(!state)return;const commission=$('editor').elements.on_commission.checked;$('productPurchaseField').classList.toggle('hidden',commission);$('productPurchaseCost').disabled=commission||!state.loaded;$('productCommissionHint').classList.toggle('hidden',!commission)}
 function show(p){clear();if(!session||!adminSecurity.owner)return;state={id:p?.id??null,terms:{revision:0,purchase_per_unit:null,expenses_per_unit:null},loaded:!p,rows:[],cursor:null,promise:null};$('productFinanceCard').classList.remove('hidden');$('productFinanceSell').textContent=p?.archive_status==='sold'?'История продажи и возврат':'Указать фактическую продажу';fields().forEach(f=>f.disabled=!!p);sync();if(p)loadCard();else $('productFinanceStatus').textContent='Закупка сохранится вместе с новой карточкой.'}
 function render(data){
  const s=data.summary;$('productFinanceSummary').textContent=s.count?`Продано: ${s.quantity} шт. на ${money(s.amount)}. Доход по заполненным продажам: ${money(s.count>0&&s.profit_missing>=s.count?null:s.profit_known)}.${s.profit_missing?' Не хватает затрат по '+s.profit_missing+' продажам.':''}`:'Подтверждённых продаж пока нет.';
  $('productFinanceSales').innerHTML=state.rows.map(e=>`<article class="finance-entry ${e.status==='cancelled'?'cancelled':''}"><div class="finance-entry-head"><div><h3>Продажа № ${esc(e.sale_id)}</h3><p>${esc(e.completed_on.split('-').reverse().join('.'))} · ${esc(e.quantity)} шт.${e.status==='cancelled'?' · Отменена':''}</p></div><strong class="finance-entry-total">${esc(money(e.amount))}</strong></div><dl class="finance-entry-numbers"><div><dt>${e.on_commission?'Владельцу':'Закупка, всего'}</dt><dd>${esc(money(e.on_commission?e.owner_due:e.purchase_cost))}</dd></div><div><dt>Расходы, всего</dt><dd>${esc(money(e.expenses))}</dd></div><div><dt>Доход по продаже</dt><dd>${e.status==='cancelled'?'—':esc(money(e.margin))}</dd></div></dl><button type="button" data-product-finance-edit="${esc(e.id)}">Заполнить / изменить расчёт</button></article>`).join('');
 }
 async function loadCard(more=false){
  if(!state?.id||!session||!adminSecurity.owner||more&&state.loading)return;const current=state,id=++requestId,epoch=sessionEpoch;current.loading=true;current.retryMore=more;$('productFinanceMore').disabled=true;$('productFinanceStatus').textContent='Загружаем закупку и продажи…';$('productFinanceRetry').classList.add('hidden');
  const job=(async()=>{try{const data=await rpc('store_product_finance',{p_product:current.id,p_before:more?current.cursor:null});if(state!==current||id!==requestId||epoch!==sessionEpoch)return;
   if(!data?.terms||!Array.isArray(data.rows)||!data.summary)throw Error('Некорректный ответ сервера');
   if(!more){current.terms=data.terms;current.loaded=true;fields().forEach(f=>f.disabled=false);$('productPurchaseCost').value=data.terms.purchase_per_unit??'';$('productUnitExpenses').value=data.terms.expenses_per_unit??'';sync()}
   const page=data.rows.slice(0,30);current.rows=more?current.rows.concat(page.filter(e=>!current.rows.some(old=>old.id===e.id))):page;current.cursor=page.at(-1)?.id??null;render(data);$('productFinanceMore').classList.toggle('hidden',data.rows.length<=30);$('productFinanceStatus').textContent='Суммы продаж ниже указаны за всё проданное количество.';
  }catch(error){if(state===current&&id===requestId&&epoch===sessionEpoch){$('productFinanceStatus').textContent='Не удалось загрузить финансы: '+error.message;$('productFinanceRetry').classList.remove('hidden')}}finally{if(state===current&&id===requestId){current.loading=false;$('productFinanceMore').disabled=false}}})();current.promise=job;await job;
 }
 async function validate(){if(!state||!adminSecurity.owner)return;if(state.promise)await state.promise;if(!state.loaded)return;values()}
 async function save(id){
  if(!state||!adminSecurity.owner)return;await validate();if(!state.loaded)return;const current=state,epoch=sessionEpoch,v=values();
  // Switching to commission preserves old acquisition terms, but never uses them as owner payout.
  if($('editor').elements.on_commission.checked)v.purchase_per_unit=current.terms.purchase_per_unit;
  if(v.purchase_per_unit===current.terms.purchase_per_unit&&v.expenses_per_unit===current.terms.expenses_per_unit)return;
  const data=await rpc('store_save_product_costs',{p_product:id,p_revision:current.terms.revision,p_purchase:v.purchase_per_unit,p_expenses:v.expenses_per_unit});
  if(state!==current||epoch!==sessionEpoch)throw Error('Сессия изменилась. Откройте карточку заново.');
  if(!data?.revision||String(data.product_id)!==String(id))throw Error('Сервер не подтвердил закупку');current.id=id;current.terms=data;
 }
 $('productFinanceRetry').onclick=()=>{if(busy)return;if(state?.loaded&&editorDirty){$('productFinanceStatus').textContent='Сначала сохраните изменения карточки и закупки.';return}loadCard(state?.retryMore===true)};
 $('productFinanceMore').onclick=()=>{if(!busy)loadCard(true)};
 $('productFinanceSell').onclick=()=>{if(busy)return;if(editorDirty){$('productFinanceStatus').textContent='Сначала сохраните изменения карточки и закупки.';return}const p=items.find(p=>String(p.id)===String(editing));if(!p){$('productFinanceStatus').textContent='Сначала сохраните новую карточку.';return}if(p.archive_status==='sold'){window.AdminSales?.forProduct(p.id);return}window.AdminSales?.open(p)};
 $('productFinanceSales').onclick=e=>{const b=e.target.closest('[data-product-finance-edit]');if(!b||busy)return;if(editorDirty){$('productFinanceStatus').textContent='Сначала сохраните изменения карточки и закупки.';return}const entry=state?.rows.find(e=>e.id===b.dataset.productFinanceEdit);if(entry)window.AdminFinance?.openEntry(entry,()=>loadCard())};
 $('editor').elements.on_commission.addEventListener('change',sync);
 window.AdminProductFinance={show,clear,save,validate};
})();
