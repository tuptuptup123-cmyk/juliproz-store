'use strict';

const { BOT_USERNAME, WEBHOOK_URL, readToken, webhookSecret } = require('../server/telegram.cjs');

class SetupError extends Error {}

async function configureTelegram(env = process.env, request = fetch, log = console.log) {
  // Only the production build may change the live bot; local runs and previews are inert.
  if (env.VERCEL_ENV !== 'production') {
    log('Telegram setup skipped outside production.');
    return { configured: false };
  }
  if (!env.TELEGRAM_BOT_TOKEN) {
    log('Telegram setup pending: add TELEGRAM_BOT_TOKEN to the Production environment and redeploy.');
    return { configured: false };
  }
  const token = readToken(env);
  if (!token) throw new SetupError('TELEGRAM_BOT_TOKEN has an invalid format. Check the Production environment variable.');

  async function call(method, body = {}) {
    try {
      const response = await request(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!data || data.ok !== true) throw new Error();
      return data.result;
    } catch {
      // Raw fetch errors can contain the token in the request URL. Never print them.
      throw new SetupError(`Telegram ${method} failed. Check the token and Telegram availability, then redeploy.`);
    }
  }

  const me = await call('getMe');
  if (me?.is_bot !== true || me.username?.toLowerCase() !== BOT_USERNAME.toLowerCase()) {
    throw new SetupError(`The token must belong to @${BOT_USERNAME}. No bot settings were changed.`);
  }
  const before = await call('getWebhookInfo');
  if (!before || typeof before.url !== 'string') throw new SetupError('Could not verify the existing webhook. No bot settings were changed.');
  if (before.url && before.url !== WEBHOOK_URL) {
    throw new SetupError('This bot already has a different webhook. Review its existing integration before replacing it. No bot settings were changed.');
  }
  await call('setWebhook', {
    url: WEBHOOK_URL,
    secret_token: webhookSecret(token),
    allowed_updates: ['message'],
    max_connections: 10,
    drop_pending_updates: false
  });
  const after = await call('getWebhookInfo');
  if (after?.url !== WEBHOOK_URL) throw new SetupError('Telegram did not confirm the expected webhook. Retry deployment.');
  log(`Telegram webhook configured for @${BOT_USERNAME}. Verify /start after the production deployment is Ready.`);
  return { configured: true };
}

if (require.main === module) {
  configureTelegram().catch(error => {
    console.error(error instanceof SetupError ? error.message : 'Telegram setup failed. No secret details were logged.');
    process.exitCode = 1;
  });
}

module.exports = { configureTelegram };
