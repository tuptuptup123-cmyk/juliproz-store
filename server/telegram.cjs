'use strict';

const { createHmac, timingSafeEqual } = require('node:crypto');

const BOT_USERNAME = 'JuliProzBot';
const SHOP_URL = 'https://juliproz-store.vercel.app/';
const MANAGER_URL = 'https://t.me/juliproz';
const WEBHOOK_URL = `${SHOP_URL}api/telegram`;
const MAX_BODY_BYTES = 128 * 1024;

const WELCOME = 'Добро пожаловать в JULI.PROZ 🤍\n\nЗдесь собраны вещи в наличии: сумки, обувь, одежда и аксессуары.\n\nОткройте магазин, выберите понравившуюся вещь и нажмите «Купить» в её карточке — откроется чат с менеджером.\n\nЕсли нужна помощь с выбором, напишите нам по кнопке ниже.';
const HELP = 'Выбирайте вещи по кнопке «Открыть магазин».\n\nЧтобы уточнить наличие, размер, стоимость или доставку, нажмите «Связаться с менеджером». Сообщения из этого бота автоматически менеджеру не пересылаются.';

function readToken(env) {
  const token = typeof env.TELEGRAM_BOT_TOKEN === 'string' ? env.TELEGRAM_BOT_TOKEN.trim() : '';
  return /^\d{5,20}:[A-Za-z0-9_-]{30,100}$/.test(token) ? token : null;
}

function webhookSecret(token) {
  return createHmac('sha256', token).update('juliproz:telegram-webhook:v1').digest('hex');
}

function validSecret(value, token) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(webhookSecret(token)));
}

function messageResponse(update) {
  if (!update || !Number.isSafeInteger(update.update_id) || update.update_id < 0) return null;
  const msg = update.message;
  if (!msg || msg.chat?.type !== 'private' || !Number.isSafeInteger(msg.chat.id) || msg.chat.id <= 0 ||
      !Number.isSafeInteger(msg.message_id) || msg.message_id <= 0 || msg.from?.is_bot !== false ||
      msg.from.id !== msg.chat.id) return null;
  // Service events, edited messages and non-text uploads do not trigger greetings.
  if (typeof msg.text !== 'string' || msg.text.length > 4096) return null;
  const command = /^\/(start|shop|help|manager)(?:@([A-Za-z0-9_]+))?(?:\s|$)/i.exec(msg.text);
  if (command?.[2] && command[2].toLowerCase() !== BOT_USERNAME.toLowerCase()) return null;
  let text = HELP;
  if (command?.[1].toLowerCase() === 'start') text = WELCOME;
  if (command?.[1].toLowerCase() === 'shop') text = 'Наш каталог вещей в наличии — по кнопке ниже 🤍';
  if (command?.[1].toLowerCase() === 'manager') text = 'Нажмите «Связаться с менеджером», чтобы задать вопрос или обсудить заказ.';
  return {
    method: 'sendMessage',
    chat_id: msg.chat.id,
    text,
    link_preview_options: { is_disabled: true },
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Открыть магазин', web_app: { url: SHOP_URL } }],
        [{ text: 'Связаться с менеджером', url: MANAGER_URL }]
      ]
    }
  };
}

// Best-effort warm-instance guard, NOT a distributed limiter or cost protection.
// Bounded memory; no message text retained. Saturation fails closed for new chats.
function createReplyGuard(now = () => performance.now()) {
  const chats = new Map();
  const seen = new Map();
  const windowMs = 60_000;
  const duplicateMs = 300_000;
  return function allow(chatId, updateId) {
    const time = now();
    for (const [id, expiry] of seen) if (expiry <= time) seen.delete(id);
    for (const [id, state] of chats) if (state.reset <= time) chats.delete(id);
    if (seen.has(updateId)) return false;
    const state = chats.get(chatId);
    if ((!state && chats.size >= 2000) || seen.size >= 10000 || (state && state.count >= 5)) return false;
    seen.set(updateId, time + duplicateMs);
    if (state) state.count++;
    else chats.set(chatId, { count: 1, reset: time + windowMs });
    return true;
  };
}

function createHandler(env = process.env, allowReply = createReplyGuard()) {
  return function telegram(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const token = readToken(env);
    const production = env.VERCEL_ENV === 'production';
    if (req.method === 'GET') {
      return res.status(200).json({ service: 'juliproz-telegram', configured: production && Boolean(token) });
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }
    // Preview deployments and missing credentials cannot process any messages.
    if (!production || !token) return res.status(503).json({ error: 'Bot is not configured' });
    if (!validSecret(req.headers['x-telegram-bot-api-secret-token'], token)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) {
      return res.status(415).json({ error: 'Expected JSON' });
    }
    if (Number(req.headers['content-length']) > MAX_BODY_BYTES) {
      return res.status(413).json({ error: 'Request too large' });
    }
    let update;
    try {
      const body = req.body;
      const serialized = typeof body === 'string' ? body : JSON.stringify(body);
      if (typeof serialized !== 'string') return res.status(400).json({ error: 'Invalid JSON' });
      if (Buffer.byteLength(serialized) > MAX_BODY_BYTES) return res.status(413).json({ error: 'Request too large' });
      update = typeof body === 'string' ? JSON.parse(body) : body;
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
    // Telegram executes this response as a Bot API method; no chat data or token is logged.
    const reply = messageResponse(update);
    // Acknowledge suppressed updates to avoid Telegram retry storms.
    return res.status(200).json(reply && allowReply(reply.chat_id, update.update_id) ? reply : { ok: true });
  };
}

module.exports = { BOT_USERNAME, SHOP_URL, WEBHOOK_URL, WELCOME, readToken, webhookSecret, messageResponse, createReplyGuard, createHandler };
