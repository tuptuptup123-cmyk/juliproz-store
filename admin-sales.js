/* Sales amounts and employee snapshots are fetched only through guarded admin RPCs. */
(()=>{
 const rpc=(name,body)=>request('/rest/v1/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const money=n=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(n)||0);
 const dateText=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)?v.split('-').reverse().join('.'):String(v||'');
 const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
 let draft=null,voidDraft=null,rows=[],cursor=null,historyRequest=0,historyBusy=false,filterSnapshot=null;
 function hide(){$('salesPanel').classList.add('hidden');historyRequest++;historyBusy=false}
 function clear(){hide();draft=null;voidDraft=null;rows=[];cursor=null;filterSnapshot=null;$('saleDialog').close();$('voidSaleDialog').close();$('saleForm').reset();$('voidSaleForm').reset();$('salesFilters').reset();for(const id of ['salesList','salesSummary','salesStatus','saleProductLabel','saleContext','saleError','voidSaleLabel','voidSaleError'])$(id).textContent='';$('moreSales').classList.add('hidden')}
 function inventoryHint(view){
  const text={legacy:'Раньше проданные и скрытые вещи хранились вместе. Уточните каждую карточку: «Отметить продано» с реальной датой и суммой или «Это скрытая вещь». Эти карточки пока не входят в сумму продаж.',hidden:'Эти вещи убраны с витрины и не считаются проданными. Их можно вернуть в продажу.',sold:'Карточки с завершённой продажей. Даты, суммы, сотрудники и продажи отдельных размеров — в истории продаж.'}[view];
  $('inventoryArchiveHint').classList.toggle('hidden',!text);$('inventoryArchiveHint').innerHTML=text?`<p>${esc(text)}</p>${view==='sold'?'<button type="button" data-view="sales">Открыть историю продаж</button>':''}`:'';
 }
 function variants(p){return p.stock_quantities!=null?Object.keys(p.stock_quantities):ProductSizes.parse(p.size).length?ProductSizes.parse(p.size):['']}
 function updateQuantity(){
  if(!draft)return;const f=$('saleForm').elements,p=draft.product,legacy=p.archive_status==='legacy',max=legacy?9999:p.stock_quantities==null?1:Number(p.stock_quantities[f.variant.value]||0);
  f.quantity.max=String(max);if(Number(f.quantity.value)>max)f.quantity.value=String(Math.max(1,max));
  $('submitSale').disabled=max<1;
 }
 function open(p){
  if(!session||busy||p.archive_status==='sold')return;
  draft={product:structuredClone(p),operation:crypto.randomUUID(),payload:null};$('saleForm').reset();$('saleFields').disabled=false;$('saleError').textContent='';
  const f=$('saleForm').elements,legacy=p.archive_status==='legacy',options=variants(p);
  f.variant.innerHTML=options.map(v=>`<option value="${esc(v)}" ${!legacy&&p.stock_quantities!=null&&p.stock_quantities[v]<1?'disabled':''}>${esc(v||'Без размера')}${p.stock_quantities!=null&&!legacy?' · остаток '+esc(p.stock_quantities[v]):''}</option>`).join('');
  const usable=options.find(v=>legacy||p.stock_quantities==null||p.stock_quantities[v]>0);if(usable!==undefined)f.variant.value=usable;
  f.sold_on.max=today();f.sold_on.value=legacy?'':today();f.quantity.value='1';f.amount.value='';
  $('saleProductLabel').textContent=`${p.brand} ${p.name} · № ${p.id}`;
  $('saleContext').textContent=legacy?'Подтверждение старой продажи. Укажите известную дату, сумму и количество. Прошлые остатки пересчитываться не будут.':p.stock_quantities==null?'В карточке не настроены остатки: продажа одной вещи снимет карточку с витрины. Если вещей несколько, сначала задайте количество в редакторе.':'Количество спишется с выбранного размера. Когда остаток закончится, карточка перейдёт в «Проданные».';
  updateQuantity();window.AdminSelects?.sync();$('saleDialog').showModal();f.amount.focus();
 }
 function closeSale(){if(busy)return;$('saleDialog').close();draft=null}
 $('closeSale').onclick=closeSale;$('cancelSale').onclick=closeSale;
 $('saleDialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();else draft=null});
 $('saleForm').elements.variant.addEventListener('change',updateQuantity);
 $('saleForm').onsubmit=async e=>{
  e.preventDefault();if(busy||!draft||!session)return;
  const f=e.target.elements,current=draft,epoch=sessionEpoch;
  const payload={p_operation_id:current.operation,p_product_id:current.product.id,p_revision:current.product.revision,p_sold_on:f.sold_on.value,p_amount:Number(f.amount.value),p_variant:f.variant.value,p_quantity:Number(f.quantity.value)};
  if(!f.amount.value||!Number.isSafeInteger(payload.p_amount)||payload.p_amount<0||payload.p_amount>999999999||!Number.isInteger(payload.p_quantity)||payload.p_quantity<1||payload.p_quantity>Number(f.quantity.max)||!payload.p_sold_on){$('saleError').textContent='Укажите дату, целую сумму и доступное количество.';return}
  // Freeze after any attempt: retry the same operation if its response was lost.
  if(current.payload&&JSON.stringify(current.payload)!==JSON.stringify(payload)){$('saleError').textContent='Повторите исходную запись или закройте форму и обновите список.';return}
  current.payload=payload;busy=true;$('saleFields').disabled=true;$('submitSale').disabled=true;$('saleError').textContent='Сохраняем продажу…';
  try{
   const result=await rpc('store_record_product_sale',payload);if(epoch!==sessionEpoch)return;
   if(!result?.sale_id)throw Error('Сервер не подтвердил продажу. Повторите сохранение.');
   if(result.product){const index=items.findIndex(p=>String(p.id)===String(result.product.id));if(index>=0)items[index]=result.product}
   $('saleDialog').close();draft=null;if(result.product&&!$('editor').classList.contains('hidden')&&String(editing)===String(result.product.id))edit(result.product);render();status('Продажа записана. Дата, сумма и сотрудник сохранены в истории.');
   try{await load()}catch{if(epoch===sessionEpoch)status('Продажа записана. Не удалось обновить список — обновите его позже.')}
  }catch(error){if(epoch===sessionEpoch)$('saleError').textContent=error.message+' Если связь прервалась, повторите сохранение: дубль не создастся.'}
  finally{busy=false;$('submitSale').disabled=false}
 };
 function filters(){const f=$('salesFilters').elements;return {p_query:f.query.value.trim(),p_from:f.from.value||null,p_to:f.to.value||null,p_state:f.state.value}}
 function renderHistory(){
  $('salesList').innerHTML=rows.map(s=>`<article class="sale-entry ${s.voided_at?'sale-voided':''}"><div class="sale-entry-top"><div><strong>${esc(s.product_label)}</strong><p>№ ${esc(s.product_id)}${s.variant?' · '+esc(s.variant):''} · ${esc(s.quantity)} шт.</p></div><strong class="sale-amount">${esc(money(s.amount))}</strong></div><div class="sale-meta"><span>Продажа: <time datetime="${esc(s.sold_on)}">${esc(dateText(s.sold_on))}</time></span><span>Записал: ${esc(s.actor_label)}</span>${s.legacy?'<span>Подтверждена из старого архива</span>':''}</div>${s.voided_at?`<p class="sale-void-note">Отменена ${esc(new Date(s.voided_at).toLocaleString('ru-RU'))} · ${esc(s.voided_label)}<br>${esc(s.void_reason)}</p>`:''}<div class="sale-row-actions">${items.some(p=>String(p.id)===s.product_id)?`<button type="button" data-sale-product="${esc(s.product_id)}">Открыть карточку</button>`:'<span class="field-help">Карточка удалена, запись сохранена</span>'}${!s.voided_at?`<button type="button" data-void-sale="${esc(s.id)}">Отменить продажу</button>`:'<span class="badge concealed">Отменена</span>'}</div></article>`).join('')||'<div class="empty-state"><h2>Продаж пока нет</h2><p>Запишите продажу через «Управление товаром → Отметить продано» или измените фильтры.</p></div>';
 }
 async function loadHistory(more=false){
  if(!session||more&&historyBusy)return;
  const current=filters();if(current.p_from&&current.p_to&&current.p_from>current.p_to){$('salesStatus').textContent='Дата начала должна быть не позже даты окончания.';return}
  if(more&&JSON.stringify(current)!==filterSnapshot){await loadHistory();return}
  const id=++historyRequest,epoch=sessionEpoch;historyBusy=true;$('moreSales').disabled=true;$('salesStatus').textContent='Загружаем продажи…';
  if(!more){rows=[];cursor=null;filterSnapshot=JSON.stringify(current);$('salesList').innerHTML='';$('salesSummary').innerHTML='';$('moreSales').classList.add('hidden')}
  try{
   const data=await rpc('store_product_sales_history',{...current,p_before:more?cursor:null});if(id!==historyRequest||epoch!==sessionEpoch)return;
   if(!Array.isArray(data?.rows)||!data.summary)throw Error('Некорректный ответ сервера');
   const page=data.rows.slice(0,30);rows=more?rows.concat(page):page;cursor=page.at(-1)?.id||null;
   $('salesSummary').innerHTML=`<div><span>Продажи</span><strong>${esc(data.summary.count)}</strong></div><div><span>Продано вещей</span><strong>${esc(data.summary.quantity)}</strong></div><div><span>Сумма продаж</span><strong>${esc(money(data.summary.amount))}</strong></div>`;
   renderHistory();$('moreSales').classList.toggle('hidden',data.rows.length<=30);$('salesStatus').textContent=`Показано записей: ${rows.length}. Сначала последние даты продаж.`;
  }catch(error){if(id===historyRequest&&epoch===sessionEpoch)$('salesStatus').textContent='Не удалось загрузить продажи: '+error.message}
  finally{if(id===historyRequest){historyBusy=false;$('moreSales').disabled=false}}
 }
 function onView(view){hide();if(view==='sales'){$('salesPanel').classList.remove('hidden');loadHistory()}}
 function forProduct(id){if(busy||!leaveEditor())return;$('salesFilters').reset();$('salesFilters').elements.query.value=String(id);$('salesFilters').elements.state.value='all';window.AdminSelects?.sync();selectView('sales')}
 $('salesFilters').onsubmit=e=>{e.preventDefault();loadHistory()};$('refreshSales').onclick=async()=>{try{await load();await loadHistory()}catch(error){$('salesStatus').textContent=error.message}};$('moreSales').onclick=()=>loadHistory(true);$('clearSalesFilters').onclick=()=>{$('salesFilters').reset();window.AdminSelects?.sync();loadHistory()};
 $('salesList').onclick=e=>{
  if(busy)return;const openButton=e.target.closest('[data-sale-product]');if(openButton){const p=items.find(p=>String(p.id)===openButton.dataset.saleProduct);if(p)edit(p);return}
  const button=e.target.closest('[data-void-sale]');if(!button)return;const s=rows.find(s=>s.id===button.dataset.voidSale);if(!s)return;
  const p=items.find(p=>String(p.id)===s.product_id);voidDraft={sale:s,revision:p?.revision??null};$('voidSaleForm').reset();$('voidSaleForm').elements.reason.disabled=false;$('voidSaleError').textContent='';$('voidSaleLabel').textContent=`${s.product_label} · ${dateText(s.sold_on)} · ${money(s.amount)}`;$('voidSaleDialog').showModal();$('voidSaleForm').elements.reason.focus();
 };
 function closeVoid(){if(busy)return;$('voidSaleDialog').close();voidDraft=null}
 $('closeVoidSale').onclick=closeVoid;$('cancelVoidSale').onclick=closeVoid;$('voidSaleDialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();else voidDraft=null});
 $('voidSaleForm').onsubmit=async e=>{
  e.preventDefault();if(busy||!session||!voidDraft)return;const epoch=sessionEpoch,reason=e.target.elements.reason.value.trim();if(reason.length<3){$('voidSaleError').textContent='Укажите причину отмены.';return}
  busy=true;$('submitVoidSale').disabled=true;e.target.elements.reason.disabled=true;$('voidSaleError').textContent='Отменяем продажу…';
  try{const result=await rpc('store_void_product_sale',{p_sale_id:voidDraft.sale.id,p_revision:voidDraft.revision,p_reason:reason});if(epoch!==sessionEpoch)return;
   if(result?.product){const i=items.findIndex(p=>String(p.id)===String(result.product.id));if(i>=0)items[i]=result.product}
   $('voidSaleDialog').close();voidDraft=null;render();await loadHistory();status('Продажа отменена. Причина и сотрудник сохранены в истории.');
  }catch(error){if(epoch===sessionEpoch)$('voidSaleError').textContent=error.message}
  finally{busy=false;$('submitVoidSale').disabled=false;e.target.elements.reason.disabled=false}
 };
 window.AdminSales={open,clear,hide,onView,forProduct,inventoryHint};
})();
