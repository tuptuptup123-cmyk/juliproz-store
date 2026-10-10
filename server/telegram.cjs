'use strict';

const { createHmac, timingSafeEqual } = require('node:crypto');

const BOT_USERNAME = 'JuliProzBot';
const SHOP_URL = 'https://juliproz-store.vercel.app/';
const MANAGER_URL = 'https://t.me/juliproz';
const WEBHOOK_URL = `${SHOP_URL}api/telegram`;
const MAX_BODY_BYTES = 128 * 1024;

const WELCOME = 'JULI.PROZ 🤍\n\nВаш доступ к миру люкса.\n\nВещи в наличии, поиск и выкуп под ваш запрос.';
const ABOUT = 'О нас 🤍\n\nJULI.PROZ — ваш персональный байер.\n\nНаходим и выкупаем люксовые вещи в бутиках, аутлетах и на приватных сейлах.\n\nПомогаем подобрать модель, цвет и размер. Ищем редкие вещи и винтаж.\n\nОрганизуем доставку по миру.\n\nВ нашем боте можно купить вещи в наличии, предложить свою вещь на выкуп или сдать её на комиссию.';
const SELL = 'Выкуп и комиссия\n\nХотите продать вещь? Выберите удобный формат.\n\nВыкуп\nРассмотрим покупку вашей вещи. Отправьте фото, описание состояния и желаемую цену — оценим и предложим условия.\n\nКомиссия\nПоможем продать ваши вещи через JULI.PROZ бот. Стоимость, комиссию и условия согласуем с вами заранее.';
const BUYOUT = 'Продать нам вещь\n\nПодготовьте фотографии вещи, бренд и модель, описание состояния, информацию о комплекте и желаемую цену.\n\nНажмите «Отправить на оценку» и отправьте эту информацию в открывшемся диалоге. После оценки обсудим возможность выкупа и условия.\n\nФото и сообщения из этого бота автоматически не пересылаются.';
const COMMISSION = 'Сдать на комиссию\n\nПоможем продать ваши вещи через JULI.PROZ бот.\n\nПодготовьте фотографии вещи, бренд и модель, описание состояния, информацию о комплекте и желаемую цену.\n\nНажмите «Обсудить комиссию» и отправьте эту информацию в открывшемся диалоге. Стоимость, комиссию и условия согласуем с вами заранее.\n\nФото и сообщения из этого бота автоматически не пересылаются.';
const SERVICES = 'Услуги\n\nАутентификация и ателье, спа для сумок, полировка и обслуживание часов.\n\nНаш опыт позволяет находить специалистов под ваш запрос. У нас есть проверенные партнёры по всему миру. Проверки и работы выполняют профильные партнёры, а мы организуем процесс и согласуем с вами условия.\n\nВыберите нужный раздел ниже.';
const AUTHENTICATION = 'Аутентификация\n\nОрганизуем онлайн- и офлайн-аутентификацию через проверенных партнёров по всему миру. Проверку подлинности проводят партнёры.\n\nПришлите фотографии вещи и деталей, бренд и модель — подберём подходящий формат проверки. Стоимость и сроки согласуем до начала работы.\n\nНажмите «Проверить вещь», чтобы обратиться к менеджеру.';
const ATELIER = 'Ателье и уход\n\nЧерез проверенных партнёров по всему миру организуем:\n• Работы ателье для ваших вещей\n• Спа и уход для сумок\n• Полировка и обслуживание часов\n\nРаботы выполняют профильные партнёры. Мы подбираем специалиста под ваш запрос и согласуем условия.\n\nПришлите фотографии и опишите, что хотите сделать — обсудим возможность работы, стоимость и сроки.\n\nНажмите «Обсудить уход», чтобы обратиться к менеджеру.';
const HELP = 'Выберите раздел ниже. Чтобы предложить вещь на выкуп или комиссию, откройте «Выкуп и комиссия». Для проверки подлинности или обращения в ателье откройте «Услуги». Сообщения из этого бота автоматически менеджеру не пересылаются.';
const back = [{ text: '← Главное меню', callback_data: 'jp:menu' }];
function screen(name) {
  const main = [[{ text: 'Магазин', web_app: { url: SHOP_URL } }], [{ text: 'Выкуп и комиссия', callback_data: 'jp:sell' }], [{ text: 'Услуги', callback_data: 'jp:services' }], [{ text: 'О нас', callback_data: 'jp:about' }]];
  const screens = {
    menu: { text: WELCOME, keyboard: main },
    about: { text: ABOUT, keyboard: [back] },
    services: { text: SERVICES, keyboard: [[{ text: 'Аутентификация', callback_data: 'jp:authentication' }], [{ text: 'Ателье и уход', callback_data: 'jp:atelier' }], back] },
    authentication: { text: AUTHENTICATION, keyboard: [[{ text: 'Проверить вещь ↗', url: MANAGER_URL + '?text=' + encodeURIComponent('Здравствуйте! Хочу организовать аутентификацию вещи через ваших партнёров. Подскажите онлайн- и офлайн-варианты, стоимость и сроки.') }], [{ text: '← Услуги', callback_data: 'jp:services' }], back] },
    atelier: { text: ATELIER, keyboard: [[{ text: 'Обсудить уход ↗', url: MANAGER_URL + '?text=' + encodeURIComponent('Здравствуйте! Хочу обратиться в ателье или обсудить спа для сумки, полировку или обслуживание часов через ваших партнёров. Пришлю фотографии и описание запроса.') }], [{ text: '← Услуги', callback_data: 'jp:services' }], back] },
    sell: { text: SELL, keyboard: [[{ text: 'Продать нам вещь', callback_data: 'jp:buyout' }], [{ text: 'Сдать на комиссию', callback_data: 'jp:commission' }], back] },
    buyout: { text: BUYOUT, keyboard: [[{ text: 'Отправить на оценку ↗', url: MANAGER_URL }], [{ text: '← Выкуп и комиссия', callback_data: 'jp:sell' }], back] },
    commission: { text: COMMISSION, keyboard: [[{ text: 'Обсудить комиссию ↗', url: MANAGER_URL }], [{ text: '← Выкуп и комиссия', callback_data: 'jp:sell' }], back] }
  };
  return screens[name];
}

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
  const command = /^\/(start|shop|help|manager|about|sell|buyout|commission|services|authentication|atelier)(?:@([A-Za-z0-9_]+))?(?:\s|$)/i.exec(msg.text);
  if (command?.[2] && command[2].toLowerCase() !== BOT_USERNAME.toLowerCase()) return null;
  const route = { start: 'menu', about: 'about', sell: 'sell', buyout: 'buyout', commission: 'commission', services: 'services', authentication: 'authentication', atelier: 'atelier' }[command?.[1].toLowerCase()];
  const selected = screen(route || 'menu');
  if (command?.[1].toLowerCase() === 'manager') selected.keyboard = [[{ text: 'Связаться с менеджером', url: MANAGER_URL }], back];
  let text = route ? selected.text : HELP;
  if (command?.[1].toLowerCase() === 'start') text = WELCOME;
  if (command?.[1].toLowerCase() === 'shop') text = 'Наш каталог вещей в наличии — по кнопке ниже 🤍';
  if (command?.[1].toLowerCase() === 'manager') text = 'Нажмите «Связаться с менеджером», чтобы задать вопрос или обсудить заказ.';
  return {
    method: 'sendMessage',
    chat_id: msg.chat.id,
    text,
    link_preview_options: { is_disabled: true },
    reply_markup: {
      inline_keyboard: selected.keyboard
    }
  };
}

// Best-effort warm-instance guard, NOT a distributed limiter or cost protection.
// Bounded memory; no message text retained. Saturation fails closed for new chats.
function createReplyGuard(now = () => performance.now(), maxReplies = 5) {
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
    if ((!state && chats.size >= 2000) || seen.size >= 10000 || (state && state.count >= maxReplies)) return false;
    seen.set(updateId, time + duplicateMs);
    if (state) state.count++;
    else chats.set(chatId, { count: 1, reset: time + windowMs });
    return true;
  };
}

function callbackResponse(update) {
  const q = update?.callback_query, msg = q?.message;
  if (!Number.isSafeInteger(update?.update_id) || update.update_id < 0 || typeof q?.id !== 'string' || q.id.length < 1 || q.id.length > 128 ||
      q.from?.is_bot !== false || msg?.chat?.type !== 'private' || !Number.isSafeInteger(msg.chat.id) || msg.chat.id <= 0 || q.from.id !== msg.chat.id ||
      !Number.isSafeInteger(msg.message_id) || msg.message_id <= 0 || typeof q.data !== 'string' || !/^jp:(menu|about|sell|buyout|commission|services|authentication|atelier)$/.test(q.data)) return null;
  const selected = screen(q.data.slice(3));
  return { method: 'editMessageText', chat_id: msg.chat.id, message_id: msg.message_id, text: selected.text,
    link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: selected.keyboard } };
}

function createHandler(env = process.env, allowReply = createReplyGuard(), apiRequest = fetch, allowCallback = createReplyGuard(() => performance.now(), 30)) {
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
    const callback = callbackResponse(update);
    if (callback) {
      // Suppress retries and excess taps before making an outbound API request.
      if (!allowCallback(callback.chat_id, update.update_id)) return res.status(200).json({ ok: true });
      // Acknowledge the tap to stop Telegram's spinner; never log token-bearing fetch errors.
      return apiRequest(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: update.callback_query.id }), redirect: 'error', signal: AbortSignal.timeout(3000)
      }).catch(() => {}).then(() => res.status(200).json(callback));
    }
    const reply = messageResponse(update);
    // Acknowledge suppressed updates to avoid Telegram retry storms.
    return res.status(200).json(reply && allowReply(reply.chat_id, update.update_id) ? reply : { ok: true });
  };
}

module.exports = { BOT_USERNAME, SHOP_URL, WEBHOOK_URL, WELCOME, readToken, webhookSecret, messageResponse, createReplyGuard, createHandler };
