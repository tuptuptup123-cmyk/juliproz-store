'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler, createReplyGuard, webhookSecret, WEBHOOK_URL, WELCOME } = require('../server/telegram.cjs');
const { configureTelegram } = require('../scripts/configure-telegram.cjs');

// Fabricated test credential; never a real bot token.
const TOKEN = `123456789:${'x'.repeat(35)}`;
const ENV = { VERCEL_ENV: 'production', TELEGRAM_BOT_TOKEN: TOKEN };
const update = text => ({ update_id: 100, message: { message_id: 8, from: { id: 42, is_bot: false }, chat: { id: 42, type: 'private' }, text } });

function invoke(body, options = {}) {
  const req = {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': webhookSecret(TOKEN) },
    body,
    ...options.request
  };
  const result = { headers: {} };
  const res = {
    setHeader(name, value) { result.headers[name] = value; },
    status(code) { result.status = code; return this; },
    json(value) { result.body = value; return this; }
  };
  (options.handler || createHandler(options.env || ENV))(req, res);
  return result;
}

test('start creates a private greeting with a three menu sections and a real Mini App button', () => {
  const result = invoke(update('/start'));
  assert.equal(result.status, 200);
  assert.equal(result.body.method, 'sendMessage');
  assert.equal(result.body.chat_id, 42);
  assert.equal(result.body.text, WELCOME);
  assert.equal(result.body.reply_markup.inline_keyboard[0][0].web_app.url, 'https://juliproz-store.vercel.app/');
  assert.deepEqual(result.body.reply_markup.inline_keyboard.map(r => r[0].text), ['Магазин', 'Выкуп и комиссия', 'О нас']);
  assert.equal(result.body.reply_markup.inline_keyboard[1][0].callback_data, 'jp:sell');
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
  assert.equal(invoke(update('/start@JuliProzBot campaign')).body.text, WELCOME);
});

test('warm-instance guard limits each chat and suppresses duplicate updates with successful acknowledgement', () => {
  let time = 0;
  const handler = createHandler(ENV, createReplyGuard(() => time));
  const send = (id, chat = 42) => {
    const body = update('/start'); body.update_id = id;
    body.message.chat.id = chat; body.message.from.id = chat;
    return invoke(body, { handler });
  };
  assert.equal(send(1).body.method, 'sendMessage');
  assert.deepEqual(send(1).body, { ok: true });
  for (let id = 2; id <= 5; id++) assert.equal(send(id).body.method, 'sendMessage');
  assert.deepEqual(send(6).body, { ok: true });
  assert.equal(send(7, 43).body.method, 'sendMessage');
  time = 60000;
  assert.equal(send(8).body.method, 'sendMessage');
  assert.deepEqual(send(1).body, { ok: true });
  time = 300000;
  assert.equal(send(1).body.method, 'sendMessage');
});

test('guard bounds memory and recovers capacity after expiry', () => {
  let time = 0;
  const allow = createReplyGuard(() => time);
  for (let id = 1; id <= 2000; id++) assert.equal(allow(id, id), true);
  assert.equal(allow(2001, 2001), false);
  time = 60000;
  assert.equal(allow(2001, 2001), true);
});

test('webhook authentication rejects spoofed requests before accessing the body', () => {
  for (const secret of [undefined, '', TOKEN, '0'.repeat(64), ['0'.repeat(64)]]) {
    let read = false;
    const req = { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': secret } };
    Object.defineProperty(req, 'body', { get() { read = true; throw new Error('must not read'); } });
    const res = { setHeader() {}, status(code) { this.code = code; return this; }, json() {} };
    createHandler(ENV)(req, res);
    assert.equal(res.code, 401);
    assert.equal(read, false);
  }
});

test('production credentials are required and preview deployments cannot answer', () => {
  for (const env of [{}, { VERCEL_ENV: 'production' }, { ...ENV, VERCEL_ENV: 'preview' }, { ...ENV, TELEGRAM_BOT_TOKEN: 'invalid' }]) {
    assert.equal(invoke(update('/start'), { env }).status, 503);
    assert.equal(invoke(null, { env, request: { method: 'GET' } }).body.configured, false);
  }
  assert.equal(invoke(null, { request: { method: 'GET' } }).body.configured, true);
  assert.equal(invoke(null, { request: { method: 'DELETE' } }).status, 405);
});

test('groups, edits, service events, other bots and invalid recipients produce no reply', () => {
  const group = update('/start'); group.message.chat.type = 'group';
  const bot = update('/start'); bot.message.from.is_bot = true;
  const mismatch = update('/start'); mismatch.message.from.id = 43;
  const invalidId = update('/start'); invalidId.message.chat.id = 1.5;
  const service = update(undefined); service.message.new_chat_members = [{ id: 42 }];
  for (const body of [group, bot, mismatch, invalidId, service, { update_id: 2, edited_message: update('/start').message }, update('/start@OtherBot'), null, [], { update_id: -1 }]) {
    assert.deepEqual(invoke(body).body, { ok: true });
  }
});

test('ordinary messages explain how to contact a human without echoing personal text', () => {
  const result = invoke(update('<b>my phone and address</b>'));
  assert.match(result.body.text, /автоматически менеджеру не пересылаются/);
  assert.equal(result.body.text.includes('my phone'), false);
  assert.equal(result.body.parse_mode, undefined);
  assert.match(invoke(update('/shop')).body.text, /каталог/);
  assert.match(invoke(update('/manager')).body.text, /задать вопрос/);
});

test('malformed JSON, unsupported bodies and oversized input are bounded', () => {
  assert.equal(invoke('{').status, 400);
  assert.equal(invoke(undefined).status, 400);
  assert.equal(invoke('a'.repeat(128 * 1024 + 1)).status, 413);
  assert.equal(invoke(update('/start'), { request: { headers: { 'x-telegram-bot-api-secret-token': webhookSecret(TOKEN), 'content-type': 'text/plain' } } }).status, 415);
  assert.equal(invoke(JSON.stringify(update('/start'))).body.text, WELCOME);
  const req = { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': webhookSecret(TOKEN) } };
  Object.defineProperty(req, 'body', { get() { throw new Error('bad JSON'); } });
  const res = { setHeader() {}, status(code) { this.code = code; return this; }, json() {} };
  createHandler(ENV)(req, res);
  assert.equal(res.code, 400);
});

function apiMock(results) {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ method: url.split('/').at(-1), body: JSON.parse(options.body), options });
    assert.equal(new URL(url).origin, 'https://api.telegram.org');
    const result = results.shift();
    if (result instanceof Error) throw result;
    return { ok: true, json: async () => ({ ok: true, result }) };
  };
  return { request, calls };
}

test('registration checks identity, preserves pending updates and verifies the webhook', async () => {
  const mock = apiMock([{ is_bot: true, username: 'JuliProzBot' }, { url: '' }, true, { url: WEBHOOK_URL }]);
  const logs = [];
  assert.deepEqual(await configureTelegram(ENV, mock.request, line => logs.push(line)), { configured: true });
  assert.deepEqual(mock.calls.map(x => x.method), ['getMe', 'getWebhookInfo', 'setWebhook', 'getWebhookInfo']);
  assert.deepEqual(mock.calls[2].body, { url: WEBHOOK_URL, secret_token: webhookSecret(TOKEN), allowed_updates: ['message', 'callback_query'], max_connections: 10, drop_pending_updates: false });
  assert.equal(mock.calls[2].options.redirect, 'error');
  assert.equal(logs.join('\n').includes(TOKEN), false);
  assert.equal(logs.join('\n').includes(webhookSecret(TOKEN)), false);
});

test('registration never touches another bot or replaces an existing integration', async () => {
  const wrongBot = apiMock([{ is_bot: true, username: 'OtherBot' }]);
  await assert.rejects(configureTelegram(ENV, wrongBot.request, () => {}), /must belong to/);
  assert.deepEqual(wrongBot.calls.map(x => x.method), ['getMe']);
  const conflict = apiMock([{ is_bot: true, username: 'JuliProzBot' }, { url: 'https://example.com/existing-bot' }]);
  await assert.rejects(configureTelegram(ENV, conflict.request, () => {}), /different webhook/);
  assert.deepEqual(conflict.calls.map(x => x.method), ['getMe', 'getWebhookInfo']);
});

test('setup errors cannot expose tokens and inert builds never call Telegram', async () => {
  const mock = apiMock([new Error(`private URL: https://api.telegram.org/bot${TOKEN}/getMe`)]);
  await assert.rejects(configureTelegram(ENV, mock.request, () => {}), error => !error.message.includes(TOKEN) && /getMe failed/.test(error.message));
  let called = false;
  for (const env of [{}, { VERCEL_ENV: 'production' }, { ...ENV, VERCEL_ENV: 'preview' }]) {
    assert.deepEqual(await configureTelegram(env, async () => { called = true; }, () => {}), { configured: false });
  }
  assert.equal(called, false);
});

const callback = data => ({ update_id: 101, callback_query: { id: 'synthetic-callback', from: { id: 42, is_bot: false }, message: { message_id: 8, chat: { id: 42, type: 'private' } }, data } });
test('info and sales navigation edits the same message and acknowledges taps', async () => {
  const calls = [];
  const handler = createHandler(ENV, undefined, async (url, options) => { calls.push(JSON.parse(options.body)); return { ok: true }; });
  for (const [index, name] of ['about', 'sell', 'buyout', 'commission', 'menu'].entries()) {
    const req = { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': webhookSecret(TOKEN) }, body: { ...callback('jp:' + name), update_id: 101 + index } };
    let reply; const res = { setHeader() {}, status(code) { assert.equal(code, 200); return this; }, json(body) { reply = body; } };
    await handler(req, res);
    assert.equal(reply.method, 'editMessageText'); assert.equal(reply.chat_id, 42); assert.equal(reply.message_id, 8);
    if (name === 'commission') assert.match(reply.text, /через JULI.PROZ бот/);
    if (name === 'menu') assert.deepEqual(reply.reply_markup.inline_keyboard.map(r => r[0].text), ['Магазин', 'Выкуп и комиссия', 'О нас']);
  }
  assert.equal(calls.length, 5);
  const bad = callback('jp:sell'); bad.callback_query.from.id = 43;
  assert.deepEqual(invoke(bad).body, { ok: true });
  assert.deepEqual(invoke(callback('jp:unknown')).body, { ok: true });
  assert.match(invoke(update('/about')).body.text, /персональный байер/);
  assert.match(invoke(update('/sell')).body.text, /Выкуп и комиссия/);
});
