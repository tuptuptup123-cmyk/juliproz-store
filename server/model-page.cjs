
'use strict';
const fs=require('node:fs'),path=require('node:path'),site=require('./site-page.cjs');
function render(model,rows,lang='ru'){return site.render(fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),'model',model.slug,lang,rows)}
function createHandler(options={}){const handle=site.createHandler(options);return (req,res)=>{const url=new URL(req.url,'https://www.juliproz.com');url.searchParams.set('page','model');req.url='/api/site-page'+url.search;return handle(req,res)}}
module.exports={render,createHandler};
