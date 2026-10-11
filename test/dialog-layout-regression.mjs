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

test(`${target}: localized Help omits implementation commentary`, () => {
  assert.doesNotMatch(html, /<p data-i18n="helpDialogs">[^<]+<\/p>/);
  assert.doesNotMatch(html, /helpDialogs:'[^']*背景[^']*スクロール[^']*'/);
  assert.doesNotMatch(html, /helpDialogs:'[^']*background page[^']*scroll[^']*'/);
});

test(`${target}: short conflict resolvers use one dialog scroll surface instead of starving their body`, () => {
  // At 393 x 252 the old four-row grid left 2px for the body. Check the
  // allocation contract, not a simulated browser layout; native hit testing
  // still verifies the actual choices, textarea, footer and sticky Close.
  const mediaStart = css.indexOf('@media(max-height:600px)');
  assert.ok(mediaStart >= 0, 'short-height resolver fallback exists');
  let depth = 1, end = css.indexOf('{', mediaStart) + 1;
  const start = end;
  for (; end < css.length && depth; end++) {
    if (css[end] === '{') depth++;
    if (css[end] === '}') depth--;
  }
  assert.equal(depth, 0, 'short-height media rule is complete');
  const short = css.slice(start, end - 1);
  const rules = new Map([...short.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, declarations]) => [selector.trim(), declarations]));
  assert.deepEqual([...rules.keys()].sort(), ['.resolver-body', '.resolver-detail', '.resolver-dialog', '.resolver-shell'], 'fallback is scoped to resolver allocation only');
  assert.match(rules.get('.resolver-dialog'), /(?:^|;)overflow:auto(?:;|$)/, 'dialog owns the bounded scroll surface');
  assert.match(rules.get('.resolver-shell'), /(?:^|;)display:block(?:;|$)/, 'progress and footer no longer reserve fixed grid tracks');
  assert.match(rules.get('.resolver-shell'), /(?:^|;)height:auto(?:;|$)/, 'mobile 100dvh shell is released');
  assert.match(rules.get('.resolver-shell'), /(?:^|;)max-height:none(?:;|$)/, 'desktop shell no longer compresses body');
  assert.match(rules.get('.resolver-body'), /(?:^|;)display:block(?:;|$)/, 'conflict list and details get their intrinsic height');
  assert.match(rules.get('.resolver-detail'), /(?:^|;)overflow:visible(?:;|$)/, 'choices and manual editing stay in the dialog scroll chain');
  assert.doesNotMatch(short, /(?:^|[;{])(?:min-height|max-height|height):(?:\d|calc|min\()/, 'no guessed pixel allocation or viewport-height child');
  assert.ok(mediaStart > css.indexOf('@media(max-width:760px)'), 'fallback wins over the mobile grid');
});

test(`${target}: resolver choice and manual controls retain usable intrinsic sizes and flow`, () => {
  assert.match(css, /\.button\{min-height:40px;/, 'choices and Continue retain their full target height');
  assert.match(css, /\.resolver-manual textarea\{width:100%;min-height:120px;resize:vertical;/, 'manual text remains editable at its normal size');
  const footer = css.match(/\.resolver-footer\{([^{}]*)\}/)[1];
  assert.doesNotMatch(footer, /position:(?:fixed|sticky|absolute)/, 'footer never overlays choice controls');
  assert.match(css, /\.dialog-head\{position:sticky;top:0;/, 'Close stays visible while the dialog scrolls');
  const start = html.indexOf('<dialog id="conflictResolverDialog"');
  const markup = html.slice(start, html.indexOf('</dialog>', start) + '</dialog>'.length);
  assert.equal(hash(markup), '5bd5fd7d4d8240f63dc5d363c7f9f8bac6e9e76a629bcf82f459414668504624', 'all resolver controls, order, IDs, labels and hidden states are preserved');
});

test(`${target}: resolver behavior and merge handlers remain byte-identical`, () => {
  const start = html.indexOf('function resetMergeResolverState');
  assert.ok(start >= 0);
  assert.equal(hash(html.slice(start, html.indexOf('async function performSelectedMerge', start))), '0d7f3b81ba23f21a23ecb67d440bc141ea610edd6419e24a3c722e9423fc12e2');
  const handlerStart = html.indexOf("$('#openConflictResolverButton').addEventListener");
  assert.ok(handlerStart >= 0);
  assert.equal(hash(html.slice(handlerStart, html.indexOf("$('#diffTab').addEventListener", handlerStart))), 'ce57bb77f8a25f4c85622154f86c47b0a3ec83aa380df4328fea4d168861e28c', 'choice, manual, previous/next, Continue, Close and backdrop handlers retain ownership');
});

test('canonical checker tests modal contracts in source and all shipped forms', () => {
  const checker = read('scripts/check-repository.ps1');
  const start = checker.indexOf('foreach ($target in @("src/index.template.html"');
  assert.ok(start >= 0);
  const loop = checker.slice(start, checker.indexOf('Write-Host "[OK] Repository check passed."', start));
  for (const file of ['src/index.template.html','dist/index.html','pptx-version-control.html','dist/index.self-extract.html']) assert.ok(loop.includes(`"${file}"`), file);
  assert.match(loop, /& node \(Join-Path \$Root "test\/dialog-layout-regression\.mjs"\) \$target\s+if \(\$LASTEXITCODE -ne 0\)/);
});
