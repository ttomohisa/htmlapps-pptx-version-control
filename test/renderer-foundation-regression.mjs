import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const html = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const startToken = 'const assetBundle=';
const start = html.indexOf(startToken);
if (start < 0) throw new Error('assetBundle missing');
let pos = start + startToken.length;
while (/\s/.test(html[pos])) pos += 1;
if (html[pos] !== '{') throw new Error('assetBundle JSON start missing');
let depth = 0, inString = false, escaped = false, end = -1;
for (let i = pos; i < html.length; i += 1) {
  const ch = html[i];
  if (inString) {
    if (escaped) escaped = false;
    else if (ch === '\\') escaped = true;
    else if (ch === '"') inString = false;
  } else {
    if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) { end = i + 1; break; }
    }
  }
}
if (end < 0) throw new Error('assetBundle JSON end missing');
const bundle = JSON.parse(html.slice(pos, end));
const asset = bundle.dependencies?.['pptx-renderer']?.assets?.browser;
if (!asset) throw new Error('pptx-renderer/browser missing');
const compressed = Buffer.from(asset.base64, 'base64');
if (compressed.length !== asset.storedBytes) throw new Error('storedBytes mismatch');
const code = zlib.gunzipSync(compressed);
if (code.length !== asset.originalBytes) throw new Error('originalBytes mismatch');
const sha = crypto.createHash('sha256').update(code).digest('hex');
if (sha !== '31cf1e39818c52395b185186229f80ecf8333db0d7bb3a06f6c0bd74b87aaad5') throw new Error(`renderer sha mismatch: ${sha}`);
for (const needle of [
  "const RENDERER_FOUNDATION_VERSION='pptx-renderer-1.2.4-v1'",
  'async function prepareRendererInput(input)',
  'async function prepareRendererSession(session)',
  'function renderPreparedSlide(prepared,slideOrIndex',
  'const RendererFoundation=Object.freeze(',
  "window.addEventListener('pagehide',clearRendererFoundation"
]) {
  if (!html.includes(needle)) throw new Error(`foundation code missing: ${needle}`);
}
if (!html.includes("connect-src 'none'")) throw new Error('connect-src none missing');
console.log(`ok: renderer asset ${code.length} bytes sha256 ${sha.slice(0, 12)}`);
console.log('ok: renderer foundation lifecycle and CSP markers');
