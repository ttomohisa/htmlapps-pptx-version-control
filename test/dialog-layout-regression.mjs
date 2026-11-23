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
  assert.equal(hash(html.slice(start, html.indexOf('\n', start))), '8077462f2514cadcf23e2d0192a38f9ea1ef38d632380ce63252a41a16be21c1');
});

test(`${target}: Help scroll stays inside the dialog and clear of Close`, () => {
  assert.ok(css.includes('#helpDialog{overflow:hidden}'), 'Help must not scroll the dialog frame');
  assert.ok(css.includes('#helpDialog[open]{display:flex;flex-direction:column;'), 'Help uses an in-panel layout');
  assert.ok(css.includes('#helpDialog .dialog-head{position:relative;flex:0 0 auto;'), 'Help header is outside the scrolling body');
  assert.ok(css.includes('#helpDialog .dialog-close{flex:0 0 auto}'), 'Close uses the shared 34px dialog-close');
  assert.ok(css.includes('#helpDialog .dialog-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;margin:0 10px 10px 0;'), 'Scrollbar is inset from the right edge');
  assert.ok(css.includes('@media(max-width:760px){.page-intro .local-badge{display:none}'), 'privacy badge is hidden on narrow screens');
  assert.ok(css.includes('max-height:min(84dvh,760px)'), 'Help remains bounded by the viewport');
});

test(`${target}: next-action panel uses a flat neutral surface`, () => {
  const rule = css.match(/\.next-action-card\{([^{}]*)\}/)?.[1];
  assert.ok(rule, 'next-action panel style exists');
  assert.match(rule, /(?:^|;)background:var\(--surface\)(?:;|$)/);
  assert.match(rule, /(?:^|;)border:1px solid var\(--line\)(?:;|$)/);
  assert.doesNotMatch(rule, /(?:linear|radial|conic)-gradient\(/, 'card has no gradient');
});

test(`${target}: Hero has only one visible explanatory paragraph, with accessible heading`, () => {
  const intro = html.match(/<section class="page-intro">([\s\S]*?)<div class="local-badge">/)?.[1];
  assert.ok(intro, 'Hero section should exist');
  assert.ok(intro.includes('<h1 class="sr-only">PPTX Version Control</h1>'), 'Heading is accessible but not visible');
  assert.ok(intro.includes('data-i18n="lead">PowerPoint（PPTX）の編集履歴を保存して、版ごとの変更点を比較できます。'));
  assert.ok(!intro.includes('data-i18n="introTitle"'), 'Old headline should not appear');
  assert.ok(html.includes("lead:'Save PowerPoint (PPTX) versions to keep an edit history and compare changes."));
  assert.ok(css.includes('.page-intro p{margin:0;max-width:880px;'), 'Hero paragraph has no leftover title margin');
  assert.ok(css.includes('.page-intro{padding-bottom:14px}.page-intro p{font-size:13px}'), 'Mobile copy stays readable');
});
test(`${target}: Help omits product-site name while retaining privacy information`, () => {
  assert.ok(html.includes('data-i18n="helpScopeTitle">主な機能'));
  assert.ok(html.includes("helpScopeTitle:'What you can do'"));
  const help = html.match(/<dialog id="helpDialog">([\s\S]*?)<\/dialog>/)?.[1];
  assert.ok(help);
  assert.ok(help.includes('読み込んだPowerPointファイルはブラウザ内で処理され、外部サーバーには送信されません。'));
  assert.ok(html.includes("helpPrivacyBody:'PowerPoint files are processed in your browser and are not sent to external servers.'"));
  assert.ok(!help.includes('Browser Kitty') && !html.includes('Browser Kitty or any external server'));
  assert.ok(!html.includes('v1.1.2でできること') && !html.includes('What v1.1.2 does'));
});

test(`${target}: all seven native dialogs retain their existing controls`, () => {
  const expected = { versionDialog:['closeVersionDialogButton','saveVersionLabelButton'], revertDialog:['cancelRevertButton','confirmRevertButton'], conflictResolverDialog:['closeConflictResolverButton','resolverContinueButton'], branchDialog:['cancelBranchButton','confirmBranchButton'], deleteBranchDialog:['cancelDeleteBranchButton','confirmDeleteBranchButton'], deleteProjectDialog:['cancelDeleteProjectButton','confirmDeleteProjectButton'], helpDialog:['closeHelpButton'] };
  for (const [id, controls] of Object.entries(expected)) {
    const dialog = html.match(new RegExp(`<dialog id="${id}"[^>]*>[\\s\\S]*?<\\/dialog>`));
    assert.ok(dialog, id);
    for (const control of controls) assert.ok(dialog[0].includes(`id="${control}"`), control);
  }
});


test(`${target}: project management uses grouped actions and unboxed statistics`, () => {
  const section = html.match(/<details class="project-tools"[^>]*>([\s\S]*?)<\/details>/)?.[1];
  assert.ok(section, 'project management details exist');
  assert.match(section, /class="repo-action-group repo-action-main"/);
  assert.match(section, /class="repo-action-group repo-action-secondary"/);
  for (const id of ['createBranchButton', 'exportProjectButton', 'exportGitButton', 'optimizeStorageButton',
    'newProjectButton', 'deleteCurrentProjectButton', 'storageActionResult']) assert.ok(section.includes(`id="${id}"`), id);
  assert.match(css, /\.project-tools \.repo-stat\{[^}]*background:transparent/);
  assert.match(css, /\.project-tools \.repo-actions\{[^}]*border-top:1px solid var\(--line\)/);
  assert.match(css, /\.repo-action-secondary\{[^}]*border-left:1px solid var\(--line\)/);
});

test(`${target}: file and analysis details separate content without nested bordered cards`, () => {
  assert.match(css, /\.technical-drawer \.file-card,\.technical-drawer \.export-card\{[^}]*border:0/);
  assert.match(css, /\.technical-drawer \.export-card\{[^}]*border-left:1px solid var\(--line\)/);
  assert.match(css, /\.technical-drawer \.stat\{[^}]*background:transparent/);
  assert.match(css, /\.technical-drawer \.semantic-stat\{[^}]*background:transparent/);
  assert.match(css, /\.technical-drawer \.semantic-list,\.technical-drawer \.semantic-inspector\{[^}]*border:0/);
  assert.match(css, /\.technical-drawer \.list-card\{border:0/);
  assert.match(css, /\.technical-drawer \.export-card\{padding:16px 0 0;border:0;border-top:1px solid var\(--line\)/);
  for (const id of ['slideCount', 'partCount', 'mediaCount', 'notesCount', 'outputFilename',
    'downloadButton', 'semanticSlideList', 'partList']) assert.ok(html.includes(`id="${id}"`), id);
});

test(`${target}: comparison keeps a bordered slide stage but not stacked result cards`, () => {
  assert.match(css, /\.compare-panel \.compare-picker-card\{[^}]*border:0/);
  assert.match(css, /\.compare-panel \.compare-side-card\{[^}]*border:0/);
  assert.match(css, /\.compare-panel \.diff-stat\{[^}]*border:0/);
  assert.match(css, /\.compare-panel \.diff-toolbar\{[^}]*border:0/);
  assert.match(css, /\.compare-panel \.visual-compare\{border:0/);
  assert.match(css, /\.compare-panel \.visual-stage-shell\{[^}]*border:1px solid var\(--line\)/);
  assert.match(css, /\.compare-panel \.visual-change-card\{[^}]*border:0/);
  assert.match(css, /\.compare-panel \.compare-side-card:last-child\{padding:14px 0 0;border:0;border-top:1px solid var\(--line\)/);
  for (const id of ['compareFromSelect', 'compareToSelect', 'compareVersionsButton',
    'diffSummary', 'compareFilterList', 'compareSlideList', 'visualStageShell']) assert.ok(html.includes(`id="${id}"`), id);
});


test(`${target}: compact comparison and keyboard-accessible breakdown remain available`, () => {
  assert.ok(html.includes('id="diffSummary"'));
  assert.ok(html.includes('id="diffBreakdown" hidden'));
  assert.ok(html.includes('<summary><span data-i18n="diffBreakdownTitle">変更内容の内訳</span>'));
  assert.ok(html.includes('id="diffBreakdownGrid"'));
  assert.ok(html.includes("diffBreakdownTitle:'Breakdown by change type'"));
  assert.ok(html.includes("renderCompactCompareSummary(session.result.summary)"));
  assert.ok(html.includes("$('#compareSwapButton').addEventListener('click',swapCompareSides)"));
  assert.doesNotMatch(html, /setTimeout\(\(\)=>showCompareDiff\(/,
    'swap must not race asynchronous version-option loading');
  assert.match(css, /\.diff-breakdown>summary:focus-visible\{outline:2px solid var\(--focus\)/);
});

test(`${target}: buttons have distinct primary, neutral, selected and danger styles`, () => {
  assert.match(css, /\.button\.primary\{border-color:var\(--accent\);background:var\(--accent\);color:#fff/);
  assert.match(css, /\.button:hover:not\(:disabled\)\{border-color:var\(--accent\)/);
  assert.match(css, /\.button\.danger-soft\{border-color:var\(--line\);background:transparent;color:var\(--danger\)/);
  assert.match(css, /\.visual-mode-button\[aria-pressed="true"\]\{border-color:var\(--accent\);background:var\(--accent\);color:#fff/);
  assert.match(css, /\.compare-swap-button\.button\.icon-button\{width:42px;height:42px;border-radius:50%/);
  assert.match(css, /@media\(max-width:760px\)\{[\s\S]*?\.button\{min-height:44px;padding:10px 12px\}/);
});

test(`${target}: Preview is a peer of History, Compare, Branches and Merge`, () => {
  const tabs = html.match(/<div class="tabs" role="tablist">([\s\S]*?)<\/div>/)?.[1];
  assert.ok(tabs);
  for (const tab of ['historyTab', 'diffTab', 'branchesTab', 'mergeTab', 'previewTab'])
    assert.ok(tabs.includes(`id="${tab}"`), tab);
  assert.ok(html.includes('id="previewPanel" role="tabpanel" aria-labelledby="previewTab"'));
  assert.ok(html.includes('id="previewSlideList"'));
  assert.ok(html.includes('id="previewCanvas"'));
  assert.ok(html.includes('id="previewHost"'));
  assert.ok(html.includes('id="previewPrevButton"'));
  assert.ok(html.includes('id="previewNextButton"'));
  assert.ok(html.includes("tabPreview:'プレビュー'"));
  assert.ok(html.includes("tabPreview:'Preview'"));
  assert.ok(html.includes("state.activeTab=state.project?'history':'preview'"), 'available before first save');
  assert.ok(html.includes('if(navigation)navigation.hidden=!state.model;'));
  assert.ok(html.includes("$('#previewTab').addEventListener('click',()=>activateTab('preview'))"));
  assert.ok(css.includes('.preview-layout{display:grid;grid-template-columns:minmax(165px,225px) minmax(0,1fr)'));
  assert.ok(css.includes('.preview-slide-list{display:flex;gap:4px;min-width:0}'), 'mobile picker scrolls horizontally');
});

test(`${target}: Preview reuses the bundled local renderer and disposes stale handles`, () => {
  assert.ok(html.includes("RendererFoundation.prepare(comparisonInputFromWorking({model,file}))"));
  assert.ok(html.includes('RendererFoundation.renderSlide(prepared,slide)'));
  assert.ok(html.includes('RendererFoundation.releaseHandle(state.previewHandle)'));
  assert.ok(html.includes("if(state.activeTab==='preview'&&which!=='preview')clearPptxPreview()"));
  assert.ok(html.includes("if(which==='preview'&&state.model)renderPptxPreview()"));
  assert.ok(html.includes('previewRenderEpoch:0'));
  assert.ok(html.includes('previewHandle:null'));
  assert.ok(html.includes('previewLimitation:'));
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
  assert.equal(hash(markup), '6c0b9b541b92381a39f5e1447a7af458042f2a583f22944cf4297a0e1e8c0285', 'all resolver controls, order, IDs, labels and hidden states are preserved');
});

test(`${target}: resolver behavior remains reachable and event handlers stay byte-identical`, () => {
  const start = html.indexOf('function resetMergeResolverState');
  assert.ok(start >= 0);
  const resolver = html.slice(start, html.indexOf('async function performSelectedMerge', start));
  for (const marker of ['function renderConflictResolver', 'function setResolverChoice', 'function applySemanticResolution', 'function continueConflictResolution']) {
    assert.ok(resolver.includes(marker), `missing resolver handler: ${marker}`);
  }
  assert.match(resolver, /groupSources\.formattingKeys/, 'formatting resolutions retain their per-property source');
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
