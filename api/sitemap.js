const config=require('../config.js'),seo=require('../seo-content.js');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');if(!['GET','HEAD'].includes(req.method)){res.statusCode=405;return res.end()}
 try{const rows=await require('../catalog-reader.js').read({url:config.url,key:config.key,fields:'id,created_at,available',fetch,signal:AbortSignal.timeout(12000)});
 const paths=[...Object.values(seo.pages).map(p=>p.path),...seo.brands.map(b=>'/brands/'+b.slug),...rows.filter(p=>/^[1-9]\d{0,17}$/.test(String(p.id))).map(p=>'/product/'+p.id)];
 const urls=paths.flatMap(path=>['ru','en'].map(lang=>seo.url(path,lang)));
 res.statusCode=200;res.setHeader('Content-Type','application/xml; charset=utf-8');res.end(req.method==='HEAD'?undefined:'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(url=>'<url><loc>'+url.replace(/&/g,'&amp;')+'</loc></url>').join('')+'</urlset>');
 }catch{res.statusCode=503;res.end()}
};
