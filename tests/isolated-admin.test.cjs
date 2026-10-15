const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

test('isolated admin build includes its dependencies but excludes public scripts and server sources', () => {
  execFileSync(process.execPath, ['scripts/build-admin.cjs'], { cwd: root });
  const out = path.join(root, 'apps/admin/dist');
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.equal(html, fs.readFileSync(path.join(out, 'admin.html'), 'utf8'));
  assert.match(html, /href="https:\/\/www\.juliproz\.com\/" target="_blank"/);
  for (const match of html.matchAll(/(?:src|href)="([^"?#]+)(?:[^" ]*)"/g)) {
    const asset = match[1];
    if (/^(?:https?:|#|\/)/.test(asset)) continue;
    assert.ok(fs.existsSync(path.join(out, asset)), `Missing dependency: ${asset}`);
  }
  for (const name of ['app.js', 'analytics.js', 'index.js', 'api', 'server', 'supabase', '.env', 'vercel.json']) {
    assert.equal(fs.existsSync(path.join(out, name)), false, `Unexpected public asset: ${name}`);
  }
  assert.doesNotMatch(html, /telegram\.org|_vercel\/|src="app\.js/);
  const crypto = require('node:crypto');
  for (const [, asset, hash] of html.matchAll(/(?:src|href)="(assets\/([a-f0-9]{16})\/[^\"]+)"/g)) {
    const contents = fs.readFileSync(path.join(out, asset));
    assert.equal(crypto.createHash('sha256').update(contents).digest('hex').slice(0, 16), hash);
    if (asset.endsWith('.css')) for (const [, font] of contents.toString().matchAll(/url\(\/(assets\/[^)]+)\)/g)) {
      assert.ok(fs.existsSync(path.join(out, font)), `Missing hashed font: ${font}`);
    }
  }
  assert.match(html, /src="assets\/[a-f0-9]{16}\/admin\.js"/);
  assert.doesNotMatch(html, /(?:src|href)="[a-z-]+\.(?:js|css)(?:\?|\")/);
});

test('isolated origin applies admin security headers to every path and does not configure the bot', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'apps/admin/vercel.json')));
  const headers = Object.fromEntries(config.headers.find(rule => rule.source === '/(.*)').headers.map(h => [h.key, h.value]));
  assert.equal(headers['Cache-Control'], 'no-store');
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.match(headers['Content-Security-Policy'], /script-src 'self';/);
  assert.doesNotMatch(headers['Content-Security-Policy'], /telegram\.org|unsafe-eval/);
  assert.doesNotMatch(config.buildCommand, /configure-telegram|build-public/);
  const cached = config.headers.filter(rule => rule.headers.some(h => h.key === 'Cache-Control' && h.value.includes('immutable')));
  assert.deepEqual(cached.map(rule => rule.source), ['/assets/(.*)']);
});
