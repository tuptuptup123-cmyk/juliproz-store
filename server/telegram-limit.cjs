'use strict';

const { createHmac } = require('node:crypto');
const ORIGIN = 'https://qhgzzhgxwpcctafpzjid.supabase.co';

// Server only. No raw chat IDs, message text, or token is stored in the limiter.
function createDistributedGuard(env = process.env, request = fetch) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const token = env.TELEGRAM_BOT_TOKEN;
  return async function allow(chatId, updateId, kind) {
    if (typeof key !== 'string' || !key || typeof token !== 'string' || !token) {
      throw Error('Shared bot limiter unavailable');
    }
    const chatHash = createHmac('sha256', token).update(`juliproz:chat-limit:v1:${chatId}`).digest('hex');
    try {
      const response = await request(`${ORIGIN}/rest/v1/rpc/consume_telegram_update`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(3000),
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_chat_hash: chatHash, p_update_id: updateId, p_kind: kind })
      });
      if (!response.ok) throw Error();
      const allowed = await response.json();
      if (typeof allowed !== 'boolean') throw Error();
      return allowed;
    } catch {
      // Never include credential-bearing request errors in logs or responses.
      throw Error('Shared bot limiter unavailable');
    }
  };
}
module.exports = { createDistributedGuard };
