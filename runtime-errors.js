/* Operational diagnostics only: no error messages, page URLs, text, identities or tokens. */
(()=>{
 const allowed=new Set(['TypeError','ReferenceError','SyntaxError','RangeError','Error']),recent=new Map();let total=0;
 const release=document.querySelector('meta[name="jp-release"]')?.content||'development';
 function point(value){
  try{const u=new URL(value,location.href);if(u.origin!==location.origin)return null;const name=u.pathname.split('/').at(-1);return /^[a-zA-Z0-9_-]{1,80}\.(js|css)$/.test(name)?name:null}catch{return null}
 }
 function report(kind,asset,line=0,column=0){
  if(!asset||total>=20)return;line=Math.min(1000000,Math.max(0,Number(line)||0));column=Math.min(1000000,Math.max(0,Number(column)||0));
  const key=[kind,asset,line,column].join(':');if(Date.now()-(recent.get(key)||0)<60000)return;recent.set(key,Date.now());total++;
  fetch('https://www.juliproz.com/api/client-errors',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,asset,line,column,release}),signal:AbortSignal.timeout(5000),keepalive:true}).catch(()=>{});
 }
 window.addEventListener('error',e=>{
  if(e.target!==window){const node=e.target;if(['SCRIPT','LINK'].includes(node?.tagName))report('ResourceError',point(node.src||node.href));return}
  report(allowed.has(e.error?.name)?e.error.name:'Error',point(e.filename),e.lineno,e.colno);
 },true);
 window.addEventListener('unhandledrejection',e=>{
  // Parse only a same-origin source location; the rejection message is never sent.
  const stack=typeof e.reason?.stack==='string'?e.reason.stack:'';
  for(const line of stack.split('\n').slice(1,10)){const match=line.match(/(https?:\/\/[^\s()]+):(\d+):(\d+)\)?$/);if(match&&point(match[1])){report('PromiseRejection',point(match[1]),+match[2],+match[3]);break}}
 });
})();
