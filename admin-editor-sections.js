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
