'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
for (const [name, file] of [
  ['lock', 'dependencies.lock.json'],
  ['standalone', 'pptx-version-control.html']
]) {
  const content = fs.readFileSync(file, 'utf8');
  const digest = crypto.createHash('sha256').update(content).digest('hex');
  const length = 6000;
  const parts = Math.ceil(content.length / length);
  console.log('BROWSERKITTY_SYNC_BEGIN ' + JSON.stringify({ name, chars: content.length, sha256: digest, parts }));
  for (let i = 0; i < parts; i++) {
    console.log('BROWSERKITTY_SYNC_CHUNK ' + JSON.stringify({ name, part: i, text: content.slice(i * length, (i + 1) * length) }));
  }
  console.log('BROWSERKITTY_SYNC_END ' + JSON.stringify({ name, parts }));
}
