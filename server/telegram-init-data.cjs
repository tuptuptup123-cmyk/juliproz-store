'use strict';
const {createHmac,timingSafeEqual}=require('node:crypto');
function validInitData(raw,token,now=Date.now()){
 if(typeof raw!=='string'||raw.length>6000||typeof token!=='string'||!token)return false;
 const p=new URLSearchParams(raw),keys=[...p.keys()];
 if(new Set(keys).size!==keys.length)return false;
 const hash=p.get('hash'),date=Number(p.get('auth_date'));
 if(!/^[a-f0-9]{64}$/.test(hash||'')||!Number.isSafeInteger(date)||date>now/1000+30||date<now/1000-86400)return false;
 p.delete('hash');
 const check=[...p.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>k+'='+v).join('\n');
 const key=createHmac('sha256','WebAppData').update(token).digest();
 return timingSafeEqual(createHmac('sha256',key).update(check).digest(),Buffer.from(hash,'hex'));
}
module.exports={validInitData};
