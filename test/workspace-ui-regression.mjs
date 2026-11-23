import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

for (const file of ['../src/index.template.html', '../pptx-version-control.html']) {
  const html = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
  test(file + ': introduction follows workspace state', () => {
    assert.match(html, /<section class="page-intro" id="pageIntro">/);
    assert.match(html, /function showState\(name\)\{[^\n]*\$\('#pageIntro'\)\.hidden=name!=='empty'/);
  });
  test(file + ': preview and comparison omit redundant copy', () => {
    assert.doesNotMatch(html, /<p data-i18n="previewBody">/);
    assert.doesNotMatch(html, /class="preview-limitation"/);
    assert.doesNotMatch(html, /status\.textContent=t\('previewReady'\)/);
    assert.match(html, /status\.textContent=''/);
    assert.doesNotMatch(html, /<p data-i18n="compareLead">/);
    assert.match(html, /<h3 class="sr-only" data-i18n="previewTitle">/);
  });
  test(file + ': history and merge retain controls with improved layout', () => {
    assert.match(html, /labels\.className='history-labels'/);
    assert.match(html, /\.history-actions \.button\{min-height:36px/);
    assert.match(html, /\.merge-toolbar\{align-items:start\}/);
    for (const id of ['openVersion', 'viewDiff', 'compareLatest', 'versionDetails',
      'createBranchButton', 'exportProjectButton', 'exportGitButton',
      'optimizeStorageButton', 'newProjectButton', 'deleteCurrentProjectButton']) {
      assert.ok(html.includes(id), 'Missing action ' + id);
    }
  });
}
