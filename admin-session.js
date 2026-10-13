(function(root){
 'use strict';
 const IDLE=30*60*1000,MAX=12*60*60*1000,WARNING=2*60*1000;
 function create(now=()=>Date.now()){
  let started=false,absolute=0,idle=0,dirty=false,dirtyAt=0,lastSent=0;
  return {
   start(){const t=now();started=true;absolute=t+MAX;idle=t+IDLE;dirty=false;lastSent=0},
   clear(){started=false;dirty=false},
   state(){const t=now(),remaining=Math.min(absolute,idle)-t;return {started,expired:started&&remaining<=0,warning:started&&remaining>0&&remaining<=WARNING,absolute:started&&absolute<=idle,remaining}},
   activity(){if(!started||this.state().expired)return false;dirty=true;dirtyAt=now();return true},
   due(){return started&&dirty&&now()-dirtyAt<=60000&&!this.state().expired&&now()-lastSent>=60000},
   sent(){dirty=false;lastSent=now();return lastSent},
   retry(){dirty=true},
   accept(data,sentAt){
    const server=Date.parse(data?.server_now),max=Date.parse(data?.expires_at),end=Date.parse(data?.idle_expires_at);
    if(![server,max,end].every(Number.isFinite)||max<=server||end<=server||max-server>MAX||end-server>IDLE)throw Error('Не удалось проверить срок входа. Войди заново.');
    if(!started||this.state().expired)return false;
    if(dirtyAt<=sentAt)dirty=false;absolute=Math.min(absolute,sentAt+max-server);idle=Math.min(absolute,sentAt+end-server);return !this.state().expired;
   }
  };
 }
 const api={create,IDLE,MAX};if(typeof module==='object'&&module.exports)module.exports=api;else root.AdminSessionClock=api;
})(typeof window==='object'?window:globalThis);
