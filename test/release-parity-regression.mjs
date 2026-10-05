import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const normalize = html => html
  .replace(/^const (APP_CONFIG|BUILD_MANIFEST|assetBundle)=.*;$/gm, 'const $1=__INJECTED__;')
  .replace(/data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+/g, '__APP_ICON_DATA_URI__')
  .replace(/\r\n/g, '\n').trim();
const hash = html => crypto.createHash('sha256').update(normalize(html)).digest('hex');
const source = read('../src/index.template.html');
const rootOnly = process.argv.includes('--root-only');
for (const path of rootOnly ? ['../pptx-version-control.html'] : ['../dist/index.html', '../pptx-version-control.html']) {
  assert.equal(hash(read(path)), hash(source), `${path} does not match the current source`);
}
if (!rootOnly) assert.equal(read('../pptx-version-control.html'), read('../dist/index.html'), 'Root release must be copied from the default build');
console.log(rootOnly ? 'ok: committed root release matches source before building' : 'ok: source, readable build, and root release parity');
