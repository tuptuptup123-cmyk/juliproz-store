(function(root){
 'use strict';
 const MAX=7*24*60*60*1000,WARNING=2*60*1000;
 function create(now=()=>Date.now()){
  let started=false,absolute=0;
  return {
   start(deadline=now()+MAX){if(!Number.isFinite(deadline)||deadline>now()+MAX)throw Error('Некорректный срок входа.');started=true;absolute=deadline},
   clear(){started=false;absolute=0},
   deadline(){return absolute},
   state(){const remaining=absolute-now();return {started,expired:started&&remaining<=0,warning:started&&remaining>0&&remaining<=WARNING,remaining}},
   accept(data,sentAt){
    const server=Date.parse(data?.server_now),max=Date.parse(data?.expires_at);
    if(![server,max,sentAt].every(Number.isFinite)||max<=server||max-server>MAX)throw Error('Не удалось проверить срок входа. Войди заново.');
    if(!started||this.state().expired)return false;
    absolute=Math.min(absolute,sentAt+max-server);return !this.state().expired;
   }
  };
 }
 const api={create,MAX};if(typeof module==='object'&&module.exports)module.exports=api;else root.AdminSessionClock=api;
})(typeof window==='object'?window:globalThis);
