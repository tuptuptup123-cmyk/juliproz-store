'use strict';
const {createHash}=require('node:crypto');
module.exports=function send(req,res,body,{staticPage=false}={}){
 const etag='\"'+createHash('sha256').update(body).digest('hex')+'\"';
 res.setHeader('ETag',etag);res.setHeader('Cache-Control','public, max-age=0, must-revalidate');
 res.setHeader('Vercel-CDN-Cache-Control',staticPage?'public, s-maxage=60, stale-while-revalidate=300':'no-store');
 if(req.headers?.['if-none-match']===etag){res.statusCode=304;return res.end()}
 res.statusCode=200;return res.end(req.method==='HEAD'?undefined:body);
};
