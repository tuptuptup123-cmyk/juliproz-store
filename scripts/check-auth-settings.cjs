'use strict';
// Management API PAT must be provided by the operator; never print it or the complete config.
// https://supabase.com/docs/reference/api/v1-update-auth-service-config
const fs=require('node:fs'),path=require('node:path'),desired=require('../supabase/rollout/auth-settings.json');
(async()=>{
 const token=process.env.SUPABASE_ACCESS_TOKEN,ref=process.env.SUPABASE_PROJECT_REF;
 if(!token||!ref||!/^[a-z]{20}$/.test(ref))throw Error('Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF through the secret manager.');
 const url=`https://api.supabase.com/v1/projects/${ref}/config/auth`,headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 if(process.argv.includes('--apply')){const r=await fetch(url,{method:'PATCH',headers,body:JSON.stringify(desired),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Auth update failed: HTTP '+r.status)}
 const r=await fetch(url,{headers,signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Auth verification failed: HTTP '+r.status);
 const config=await r.json(),results=Object.fromEntries(Object.entries(desired).map(([key,value])=>[key,key==='password_min_length'?config[key]>=value:config[key]===value]));
 console.log(JSON.stringify(results,null,2));if(Object.values(results).includes(false))process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1});
