// Styled inventory menus keep native select values and change handlers as the source of truth.
(()=>{
 const menus=[];
 function close(menu,focus=false){menu.panel.hidden=true;menu.button.setAttribute('aria-expanded','false');if(focus)menu.button.focus()}
 function closeAll(except){menus.forEach(m=>{if(m!==except)close(m)})}
 function sync(menu){
  const selected=menu.select.selectedOptions[0];menu.text.textContent=selected?.textContent||'';
  menu.button.setAttribute('aria-label',`${menu.label}: ${menu.text.textContent}`);
  const options=[...menu.select.options];menu.list.replaceChildren();
  options.forEach(option=>{const item=document.createElement('button');item.type='button';item.className='admin-select-option';item.setAttribute('role','option');item.setAttribute('aria-selected',String(option.selected));item.disabled=option.disabled;item.textContent=option.textContent;item.dataset.value=option.value;item.onclick=()=>{menu.select.value=option.value;menu.select.dispatchEvent(new Event('change',{bubbles:true}));sync(menu);close(menu,true)};menu.list.append(item)});
 }
 function open(menu,last=false){closeAll(menu);sync(menu);menu.panel.hidden=false;menu.button.setAttribute('aria-expanded','true');const choices=[...menu.list.children].filter(n=>!n.disabled);const selected=choices.find(n=>n.getAttribute('aria-selected')==='true');(last?choices.at(-1):selected||choices[0])?.focus()}
 for(const [id,label] of [['categoryFilter','Категория'],['genderFilter','Раздел']]){
  const select=document.getElementById(id);if(!select)continue;
  const wrapper=document.createElement('div');wrapper.className='admin-select';select.before(wrapper);wrapper.append(select);select.classList.add('admin-select-native');select.setAttribute('tabindex','-1');select.setAttribute('aria-hidden','true');
  const button=document.createElement('button');button.type='button';button.className='admin-select-trigger';button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls',`${id}-options`);
  const text=document.createElement('span'),arrow=document.createElement('span');arrow.className='admin-select-arrow';arrow.setAttribute('aria-hidden','true');arrow.textContent='⌄';button.append(text,arrow);
  const panel=document.createElement('div');panel.className='admin-select-panel';panel.hidden=true;
  const list=document.createElement('div');list.id=`${id}-options`;list.className='admin-select-options';list.setAttribute('role','listbox');list.setAttribute('aria-label',label);panel.append(list);wrapper.append(button,panel);
  const menu={select,wrapper,button,text,panel,list,label};menus.push(menu);sync(menu);
  button.onclick=()=>panel.hidden?open(menu):close(menu);
  button.onkeydown=e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();open(menu,e.key==='ArrowUp')}if(e.key==='Escape')close(menu,true)};
  list.onkeydown=e=>{const choices=[...list.children].filter(n=>!n.disabled),index=choices.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?choices.length-1:(index+(e.key==='ArrowDown'?1:-1)+choices.length)%choices.length;choices[next]?.focus()}if(e.key==='Escape'){e.preventDefault();close(menu,true)}if(e.key==='Tab')close(menu)};
  select.addEventListener('change',()=>sync(menu));new MutationObserver(()=>sync(menu)).observe(select,{childList:true,subtree:true,attributes:true});
 }
 document.addEventListener('pointerdown',e=>menus.forEach(menu=>{if(!menu.wrapper.contains(e.target))close(menu)}));
 document.addEventListener('focusin',e=>menus.forEach(menu=>{if(!menu.wrapper.contains(e.target))close(menu)}));
 window.AdminSelects={sync:()=>menus.forEach(sync)};
})();
