import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';

// CSS/source contracts only. Native scrolling, keyboard and focus require browser QA.
const root = new URL('../', import.meta.url);
const target = process.argv[2] || 'src/index.template.html';
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
let html = path.isAbsolute(target) ? fs.readFileSync(target, 'utf8') : read(target);
if (target.includes('self-extract')) {
  const payload = html.match(/<script id="self-extract-payload" type="application\/octet-stream">([\s\S]*?)<\/script>/);
  assert.ok(payload, 'self-extract payload exists');
  html = gunzipSync(Buffer.from(payload[1], 'base64')).toString('utf8');
}
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

test(`${target}: html and body lock only while a native modal is open`, () => {
  const lock = css.match(/html:has\(dialog:modal\),\s*body:has\(dialog:modal\)\s*\{([^{}]*)\}/);
  assert.ok(lock, 'root and body share a native-modal scroll lock');
  assert.match(lock[1], /(?:^|;)\s*overflow\s*:\s*hidden\s*(?:;|$)/);
  assert.match(lock[1], /(?:^|;)\s*overscroll-behavior\s*:\s*none\s*(?:;|$)/);
  assert.doesNotMatch(lock[1], /\b(?:position|height)\s*:/, 'lock does not reposition or resize the page');
});

test(`${target}: existing whole-dialog scroll and sticky Close shell stay unchanged`, () => {
  const start = html.indexOf('    dialog{');
  assert.ok(start >= 0);
  assert.equal(hash(html.slice(start, html.indexOf('\n', start))), '248a0018fa25c634435ae4f8689348f35465b8dd77baa47bd127f94623f861ca');
});

test(`${target}: all seven native dialogs retain their existing controls`, () => {
  const expected = { versionDialog:['closeVersionDialogButton','saveVersionLabelButton'], revertDialog:['cancelRevertButton','confirmRevertButton'], conflictResolverDialog:['closeConflictResolverButton','resolverContinueButton'], branchDialog:['cancelBranchButton','confirmBranchButton'], deleteBranchDialog:['cancelDeleteBranchButton','confirmDeleteBranchButton'], deleteProjectDialog:['cancelDeleteProjectButton','confirmDeleteProjectButton'], helpDialog:['closeHelpButton'] };
  for (const [id, controls] of Object.entries(expected)) {
    const dialog = html.match(new RegExp(`<dialog id="${id}"[^>]*>[\\s\\S]*?<\\/dialog>`));
    assert.ok(dialog, id);
    for (const control of controls) assert.ok(dialog[0].includes(`id="${control}"`), control);
  }
});

test(`${target}: existing shield/check privacy badge stays byte-identical`, () => {
  const badge = html.match(/<div class="local-badge">[\s\S]*?<\/div>/)[0];
  assert.equal(hash(badge), '77fe3f6c6d68577b9afb9fd4cecf97297dac96dcf5609a05bfe4ab93909bc85d');
});

test(`${target}: existing close, cancel and backdrop handler ownership stays unchanged`, () => {
  const handlers = html.split('\n').filter(line => /^(?:const versionDialog=|const helpDialog=|const revertDialog=|const branchDialog=|const deleteBranchDialog=|const deleteProjectDialog=)/.test(line)).join('\n');
  assert.equal(hash(handlers), '4ec0c743b4ad74e2182e4504b97254c04326d5d4852f5a0c0ee9ac6b902ef7fe');
});

test(`${target}: localized Help explains modal-only background locking`, () => {
  assert.match(html, /<p data-i18n="helpDialogs">[^<]+<\/p>/);
  assert.match(html, /helpDialogs:'[^']*背景[^']*スクロール[^']*'/);
  assert.match(html, /helpDialogs:'[^']*background page[^']*scroll[^']*'/);
});

test('canonical checker tests modal contracts in source and all shipped forms', () => {
  const checker = read('scripts/check-repository.ps1');
  const start = checker.indexOf('foreach ($target in @("src/index.template.html"');
  assert.ok(start >= 0);
  const loop = checker.slice(start, checker.indexOf('Write-Host "[OK] Repository check passed."', start));
  for (const file of ['src/index.template.html','dist/index.html','pptx-version-control.html','dist/index.self-extract.html']) assert.ok(loop.includes(`"${file}"`), file);
  assert.match(loop, /& node \(Join-Path \$Root "test\/dialog-layout-regression\.mjs"\) \$target\s+if \(\$LASTEXITCODE -ne 0\)/);
});
