'use strict';
const {createHash,randomBytes,createCipheriv,createDecipheriv}=require('node:crypto');
// Separate domain keys for session credentials and short-lived delivery envelopes.
function key(secret,purpose){if(typeof secret!=='string'||secret.length<32)throw Error('Secret unavailable');return createHash('sha256').update(purpose+'\0'+secret).digest()}
function seal(value,secret,purpose){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(secret,purpose),iv);cipher.setAAD(Buffer.from(purpose));const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64url')}
function open(value,secret,purpose){const bytes=Buffer.from(value,'base64url');if(bytes.length<29)throw Error('Invalid envelope');const decipher=createDecipheriv('aes-256-gcm',key(secret,purpose),bytes.subarray(0,12));decipher.setAAD(Buffer.from(purpose));decipher.setAuthTag(bytes.subarray(12,28));return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8'))}
module.exports={seal,open};
