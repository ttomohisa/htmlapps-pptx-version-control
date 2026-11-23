import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const docs=['README.md','README.ja.md','APP_SPEC.md','SECURITY.md','CONTRIBUTING.md','docs/ARCHITECTURE.md','docs/PR_PREVIEW_SECURITY.md'];
test('relative documentation links refer to tracked paths',()=>{
 for(const name of docs){
  const content=read(name);
  for(const m of content.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)){
   const href=m[1];
   if(/^(?:https?:|mailto:|data:|#)/i.test(href))continue;
   const value=decodeURIComponent(href.split('#')[0].split('?')[0]);
   if(!value)continue;
   const target=path.resolve(root,path.dirname(name),value);
   assert.ok(target.startsWith(root),'link escapes repository: '+name+' '+href);
   assert.ok(fs.existsSync(target),'broken documentation link: '+name+' -> '+href);
  }
 }
});
test('user instructions match tracked standalone artifact and release workflow',()=>{
 for(const lang of ['README.ja.md','README.md']){
  const content=read(lang);
  assert.match(content,/releases\/latest/);
  assert.match(content,/\]\(pptx-version-control\.html\)/);
  assert.doesNotMatch(content,/\]\(dist\/index\.html\)/);
  assert.match(content,/assets\/screenshot(?:-en)?\.png/);
 }
 const version=JSON.parse(read('app.config.json')).version;
 assert.ok(read('CHANGELOG.md').includes('## '+version+' '),'changelog version differs from app config');
});
test('current features are described in both README languages',()=>{
 const ja=read('README.ja.md'),en=read('README.md');
 for(const word of ['履歴の検索','前の変更','次の変更','スマホのタブ'])assert.ok(ja.includes(word),'ja missing '+word);
 for(const word of ['Search version history','Previous change','Next change','phone'])assert.ok(en.includes(word),'en missing '+word);
});
test('readme images are actual 1360 x 900 PNGs',()=>{
 const expected=Buffer.from([137,80,78,71,13,10,26,10]);
 for(const name of ['assets/screenshot.png','assets/screenshot-en.png']){
  const bytes=fs.readFileSync(path.join(root,name));
  assert.ok(bytes.length>10000,'screenshot is not a rendered application image: '+name);
  assert.ok(bytes.subarray(0,8).equals(expected),'not PNG: '+name);
  assert.equal(bytes.readUInt32BE(16),1360,'screenshot width: '+name);
  assert.equal(bytes.readUInt32BE(20),900,'screenshot height: '+name);
 }
});
