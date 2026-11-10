const config=require('../config.js'),seo=require('../seo-content.js'),catalogSEO=require('../catalog-seo.js');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');if(!['GET','HEAD'].includes(req.method)){res.statusCode=405;return res.end()}
 try{const rows=await require('../catalog-reader.js').read({url:config.url,key:config.key,fields:'id,created_at,seo_updated_at,available,brand,name,image_url,photos',fetch,signal:AbortSignal.timeout(12000)});
 const paths=['/terms.html','/privacy.html',...Object.values(seo.pages).map(p=>p.path),...seo.brands.map(b=>'/brands/'+b.slug),...catalogSEO.models.map(m=>'/models/'+m.slug),...rows.filter(p=>/^[1-9]\d{0,17}$/.test(String(p.id))).map(p=>'/product/'+p.id)];
 // Fixed content release date plus actual public edits. Never stamp every crawl with today's date.
 const date=p=>[catalogSEO.lastmod(catalogSEO.contentDate),catalogSEO.lastmod(p?.seo_updated_at),catalogSEO.lastmod(p?.created_at)].filter(Boolean).sort().at(-1);
 const dates=new Map(rows.map(p=>['/product/'+p.id,date(p)]));
 // Collection membership can change when a piece is hidden or deleted. Until a collection-level
 // change log exists, omit collection lastmod rather than infer it from surviving products.
 const escape=value=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
 // Reuse the product page's allowlist; never publish arbitrary or private image URLs.
 const {photo}=require('../server/public-product-image.cjs');
 const images=new Map(rows.map(p=>['/product/'+p.id,[...new Set([p.image_url,...(Array.isArray(p.photos)?p.photos:[])].map(photo).filter(Boolean))].slice(0,8)]));
 for(const [path,photos] of Object.entries(require('../discovery-pages.js').editorialImages))images.set(path,photos.map(src=>seo.origin+src));
 const entries=paths.flatMap(path=>['ru','en'].map(lang=>'<url><loc>'+escape(seo.url(path,lang))+'</loc>'+(dates.get(path)?'<lastmod>'+dates.get(path)+'</lastmod>':'')+['ru','en','x-default'].map(alternate=>'<xhtml:link rel="alternate" hreflang="'+alternate+'" href="'+escape(seo.url(path,alternate==='en'?'en':'ru'))+'"/>').join('')+(images.get(path)||[]).map(src=>'<image:image><image:loc>'+escape(src)+'</image:loc></image:image>').join('')+'</url>'));
 res.setHeader('Content-Type','application/xml; charset=utf-8');require('../server/public-response.cjs')(req,res,'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">'+entries.join('')+'</urlset>');
 }catch{res.statusCode=503;res.end()}
};
