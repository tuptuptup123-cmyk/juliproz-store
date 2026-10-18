'use strict';
module.exports=require('../server/telegram-share.cjs').createHandler();
module.exports.config={api:{bodyParser:false}};
