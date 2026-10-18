const config=require('../config.js'),seo=require('../seo-content.js');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');if(!['GET','HEAD'].includes(req.method)){res.statusCode=405;return res.end()}
 try{const rows=await require('../catalog-reader.js').read({url:config.url,key:config.key,fields:'id,created_at,available',fetch,signal:AbortSignal.timeout(12000)});
 const paths=['/terms.html','/privacy.html',...Object.values(seo.pages).map(p=>p.path),...seo.brands.map(b=>'/brands/'+b.slug),...rows.filter(p=>/^[1-9]\d{0,17}$/.test(String(p.id))).map(p=>'/product/'+p.id)];
 const escape=value=>value.replace(/&/g,'&amp;');
 const entries=paths.flatMap(path=>['ru','en'].map(lang=>'<url><loc>'+escape(seo.url(path,lang))+'</loc>'+['ru','en','x-default'].map(alternate=>'<xhtml:link rel="alternate" hreflang="'+alternate+'" href="'+escape(seo.url(path,alternate==='en'?'en':'ru'))+'"/>').join('')+'</url>'));
 res.setHeader('Content-Type','application/xml; charset=utf-8');require('../server/public-response.cjs')(req,res,'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'+entries.join('')+'</urlset>');
 }catch{res.statusCode=503;res.end()}
};
