const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Text transport preserves the reviewed image bytes through the Contents API.
// Only decoded images enter the public build; provenance stays in source.
module.exports = function stagePhotos(root, out) {
  const source = path.join(root, 'photo-assets');
  if (!fs.existsSync(source)) return;
  for (const filename of fs.readdirSync(source)) {
    if (!filename.endsWith('.json')) continue;
    const asset = JSON.parse(fs.readFileSync(path.join(source, filename), 'utf8'));
    if (!/^photo-cleanup-20261011\/[a-z0-9-]+\.webp$/.test(asset.path)) {
      throw new Error(`Invalid photo asset path: ${filename}`);
    }
    const bytes = Buffer.from(asset.base64, 'base64');
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== asset.sha256) {
      throw new Error(`Photo checksum mismatch: ${filename}`);
    }
    if (bytes.subarray(0, 4).toString() !== 'RIFF' || bytes.subarray(8, 12).toString() !== 'WEBP') {
      throw new Error(`Expected WebP photo: ${filename}`);
    }
    const target = path.join(out, 'images', asset.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  }
};

// Source fixture staging for browser tests; production builds use stage-images.cjs.
if(require.main===module)module.exports(path.resolve(__dirname,'..'),path.resolve(__dirname,'..'));
