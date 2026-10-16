/* Presentation controls use the existing inventory and navigation as their source of truth. */
(()=>{
 'use strict';
 const menus=[$('profileMenu'),$('moreProductViews')];
 function closeMenus(focus=false){for(const menu of menus){if(menu.open&&focus)menu.querySelector('summary').focus();menu.open=false}}
 for(const menu of menus)menu.addEventListener('toggle',()=>{if(menu.open)for(const other of menus)if(other!==menu)other.open=false});
 document.addEventListener('pointerdown',event=>{for(const menu of menus)if(!menu.contains(event.target))menu.open=false});
 document.addEventListener('focusin',event=>{for(const menu of menus)if(!menu.contains(event.target))menu.open=false});
 document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenus(true)});
 $('workspace').addEventListener('click',event=>{if(event.target.closest('[data-view],#logout,#newProduct,#topNewProduct'))closeMenus()});
 $('toggleInventoryFilters').onclick=()=>{const expanded=$('inventoryFilters').classList.toggle('hidden')===false;$('toggleInventoryFilters').setAttribute('aria-expanded',String(expanded));if(!expanded)$('toggleInventoryFilters').focus()};
 $('inventorySort').onchange=render;
 // Top save uses the same form and validation; mirror processing/permission locks.
 const syncSave=()=>{$('saveTop').disabled=$('save').disabled||$('editorFields').disabled};
 for(const id of ['save','editorFields'])new MutationObserver(syncSave).observe($(id),{attributes:true,attributeFilter:['disabled']});syncSave();
 $('showUploadGuide').onclick=()=>{const guide=$('uploadGuide');guide.open=true;$('uploadGuideSummary').focus({preventScroll:true});guide.scrollIntoView({behavior:'auto',block:'start'})};
 function setLayout(layout){$('inventory').classList.toggle('inventory-list',layout==='list');$('inventoryGridView').setAttribute('aria-pressed',String(layout!=='list'));$('inventoryListView').setAttribute('aria-pressed',String(layout==='list'));try{localStorage.setItem('jpAdminInventoryLayout',layout)}catch{}}
 $('inventoryGridView').onclick=()=>setLayout('grid');$('inventoryListView').onclick=()=>setLayout('list');
 try{setLayout(localStorage.getItem('jpAdminInventoryLayout')==='list'?'list':'grid')}catch{}
 function sync(){
  const editorOpen=!$('editor').classList.contains('hidden'),inventoryOpen=!$('inventoryPanel').classList.contains('hidden')&&!editorOpen;
  document.body.dataset.managerView=editorOpen?'editor':inventoryOpen?'inventory':'other';
  const count=Number(Boolean($('categoryFilter').value))+Number(Boolean($('genderFilter').value));
  $('inventoryFilterCount').textContent=count;$('inventoryFilterCount').classList.toggle('hidden',!count);
  $('resetFilters').classList.toggle('hidden',!count&&!$('adminSearch').value&&$('inventorySort').value==='newest');
  const extra=$('moreProductViews').querySelector(`[data-view="${activeView}"]`);
  $('moreProductViewsLabel').textContent=extra?viewNames[activeView]:'Ещё';$('moreProductViews').classList.toggle('has-active',Boolean(extra));
  $('productFinanceJump').classList.toggle('hidden',$('productFinanceCard').classList.contains('hidden'));
  $('internalNoteJump').classList.toggle('hidden',$('internalNoteCard').classList.contains('hidden'));
 }
 for(const id of ['editor','inventoryPanel','productFinanceCard','internalNoteCard'])new MutationObserver(sync).observe($(id),{attributes:true,attributeFilter:['class']});
 const profile=$('currentAdminProfile');new MutationObserver(()=>{if(!profile.textContent)profile.textContent='Профиль'}).observe(profile,{childList:true});
 $('resetFilters').addEventListener('click',()=>{$('inventorySort').value='newest';render()});
 window.AdminManager={sync,clear:()=>{closeMenus();$('inventoryFilters').classList.add('hidden');$('toggleInventoryFilters').setAttribute('aria-expanded','false');$('inventorySort').value='newest';sync()}};
 sync();
})();
