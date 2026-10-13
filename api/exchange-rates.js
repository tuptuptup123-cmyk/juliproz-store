'use strict';
module.exports=(_req,res)=>{res.setHeader('Cache-Control','no-store');return res.status(410).json({error:'Exchange rate service retired; catalogue uses EUR'})};
