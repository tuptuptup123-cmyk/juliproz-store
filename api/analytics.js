'use strict';
module.exports=require('../server/analytics.cjs').createHandler();
module.exports.config={api:{bodyParser:false}};
