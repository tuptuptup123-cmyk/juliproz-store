// Compatibility for tabs opened before the trusted-IP gateway release.
// Every accepted POST must enter Vercel; this endpoint has no database access.
const origins=new Set(['https://juliproz-store.vercel.app','https://juliproz.com','https://www.juliproz.com']);
Deno.serve(async(req)=>{
 const origin=req.headers.get('origin');
 const headers={'Access-Control-Allow-Origin':origins.has(origin)?origin:'https://www.juliproz.com','Vary':'Origin','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
 if(!origins.has(origin))return new Response(null,{status:403,headers});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return new Response(null,{status:405,headers});
 return new Response(null,{status:307,headers:{...headers,Location:'https://www.juliproz.com/api/analytics'}});
});
