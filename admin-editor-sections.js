(()=>{
 // Keep the original fields and their handlers; only the presentation is folded.
 for(const id of ['productFinanceCard','internalNoteCard']){
  const section=$(id),heading=section.querySelector('.section-heading');if(!heading)continue;
  const details=document.createElement('details');details.className='editor-disclosure';
  const summary=document.createElement('summary');summary.append(heading);details.append(summary);
  const content=document.createElement('div');content.className='editor-disclosure-content';
  for(const node of [...section.childNodes])if(!node.classList?.contains('sensitive-lock'))content.append(node)
  details.append(content);section.append(details);
 }
 function reveal(node){for(let el=node;el;el=el.parentElement)if(el.tagName==='DETAILS')el.open=true}
 $('editor').addEventListener('invalid',e=>reveal(e.target),true);
 for(const [button,id] of [['productFinanceJump','productFinanceCard'],['internalNoteJump','internalNoteCard']])$(button).addEventListener('click',()=>{const section=$(id);section.querySelector('details').open=true;section.scrollIntoView({block:'start',behavior:'smooth'})});
 $('editor').addEventListener('input',e=>{const d=e.target.closest('.editor-disclosure');if(d)d.dataset.hasDraft='true'});
})();

// The guide is read-only: navigation and copying never alter the product draft.
(()=>{
 const guide=$('productSeoGuide'),tabs=[...guide.querySelectorAll('[data-writing-tab]')];
 let returnField='name';
 function select(key){
  if(!tabs.some(tab=>tab.dataset.writingTab===key))return;
  for(const tab of tabs){const active=tab.dataset.writingTab===key;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;$(tab.getAttribute('aria-controls')).hidden=!active}
 }
 function open(key){returnField=key==='Description'?'description':key==='English'?'name_en':'name';select(key);guide.open=true;$('writingTab'+key).focus({preventScroll:true});guide.scrollIntoView({block:'start',behavior:document.body.classList.contains('reduce-motion')||matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}
 $('editor').addEventListener('click',event=>{
  const shortcut=event.target.closest('[data-writing-open]');if(shortcut){open(shortcut.dataset.writingOpen);return}
  const tab=event.target.closest('[data-writing-tab]');if(tab)select(tab.dataset.writingTab);
 });
 guide.querySelector('[role=tablist]').addEventListener('keydown',event=>{
  const index=tabs.indexOf(event.target);if(index<0)return;
  const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:null;
  if(next===null)return;event.preventDefault();select(tabs[next].dataset.writingTab);tabs[next].focus();
 });
 $('copyWritingTemplate').addEventListener('click',async()=>{
  const template=$('writingDescriptionTemplate'),message=$('writingCopyStatus');
  try{await navigator.clipboard.writeText(template.textContent.trim());message.textContent='Шаблон скопирован. Вставьте в описание и замените скобки фактами о вещи.'}
  catch{const range=document.createRange();range.selectNodeContents(template);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);message.textContent='Текст выделен. Скопируйте его через меню устройства или Ctrl/Cmd + C.'}
 });
 $('closeWritingGuide').addEventListener('click',()=>{guide.open=false;$('editor').elements[returnField].focus()});
 $('editor').addEventListener('reset',()=>{guide.open=false;returnField='name';select('Name');$('writingCopyStatus').textContent=''});
})();
