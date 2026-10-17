const config=require('../config.js');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');if(req.method!=='GET'){res.statusCode=405;return res.end()}
 try{const rows=await require('../catalog-reader.js').read({url:config.url,key:config.key,fields:'id,created_at',fetch,signal:AbortSignal.timeout(12000)});
 const urls=['https://www.juliproz.com/',...rows.filter(p=>/^[1-9]\d{0,17}$/.test(String(p.id))).map(p=>'https://www.juliproz.com/product/'+p.id)];
 res.statusCode=200;res.setHeader('Content-Type','application/xml');res.end('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(url=>'<url><loc>'+url+'</loc></url>').join('')+'</urlset>');
 }catch{res.statusCode=503;res.end()}
};
