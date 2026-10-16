'use strict';
// Native ingress preserves visitor IP before the signed cross-project relay.
module.exports=require('../../../server/analytics-relay.cjs').createRelay();
module.exports.config={api:{bodyParser:false}};
