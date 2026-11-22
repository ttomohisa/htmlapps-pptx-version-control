'use strict';
// Browser-level confirmation of asynchronous branch/version swapping with a
// real, synthetic .pptxvc fixture. No private files or external requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

async function main() {
  fs.mkdirSync('test-results/mobile-layout', { recursive: true });
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ja' });
    const page = await context.newPage(), errors = [], outbound = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/^https?:/i.test(request.url())) outbound.push(request.url()); });
    await page.goto(pathToFileURL(path.resolve('dist/index.html')).href);
    await page.locator('#projectImportInput').setInputFiles(path.resolve('test/fixtures/merge-lineage.pptxvc'));
    await page.locator('#projectState').waitFor({ state: 'visible', timeout: 30000 });
    await page.locator('#diffTab').click();
    await page.waitForFunction(() => {
      const from = document.querySelector('#compareFromSelect');
      const to = document.querySelector('#compareToSelect');
      return from?.options.length >= 2 && to?.options.length >= 2;
    });
    await page.locator('#compareToBranchSelect').selectOption('refs/heads/audit-incoming');
    await page.waitForFunction(() => document.querySelector('#compareToSelect')?.options.length === 2);
    // Incoming branch contains the common ancestor and incoming revision.
    await page.locator('#compareFromSelect').selectOption({ index: 0 });
    await page.locator('#compareToSelect').selectOption({ index: 0 });
    await page.waitForFunction(() => {
      const from = document.querySelector('#compareFromSelect');
      const to = document.querySelector('#compareToSelect');
      return from?.value && to?.value && from.value !== to.value &&
        !document.querySelector('#compareVersionsButton').disabled;
    });
    const initial = await page.evaluate(() => ({
      fromRef: document.querySelector('#compareFromBranchSelect').value,
      toRef: document.querySelector('#compareToBranchSelect').value,
      fromId: document.querySelector('#compareFromSelect').value,
      toId: document.querySelector('#compareToSelect').value
    }));
    assert.equal(initial.fromRef, 'refs/heads/main');
    assert.equal(initial.toRef, 'refs/heads/audit-incoming');
    assert.notEqual(initial.fromId, initial.toId);
    await page.locator('#compareVersionsButton').click();
    await page.waitForFunction(() => {
      const summary = document.querySelector('#diffSummary');
      return !document.querySelector('#diffContent').hidden && summary?.children.length === 3;
    }, null, { timeout: 30000 });
    await page.screenshot({ path: path.join('test-results/mobile-layout', 'comparison-390-before.png'), fullPage: true });
    const before = await page.locator('#diffMeta').textContent();
    assert.ok(before.includes(' → '), 'direction is shown');
    assert.equal(await page.locator('#diffSummary .diff-stat').count(), 3);
    const detail = page.locator('#diffBreakdown');
    if (await detail.isVisible()) {
      assert.equal(await detail.getAttribute('open'), null, 'category counts are collapsed by default');
      await detail.locator('summary').click();
      assert.equal(await detail.locator('.diff-breakdown-stat').count(), 7);
      await detail.locator('summary').click();
    }
    await page.locator('#compareSwapButton').click();
    await page.waitForFunction(({ initial }) => {
      const fromRef = document.querySelector('#compareFromBranchSelect').value;
      const toRef = document.querySelector('#compareToBranchSelect').value;
      const from = document.querySelector('#compareFromSelect').value;
      const to = document.querySelector('#compareToSelect').value;
      const title = document.querySelector('#diffMeta')?.textContent || '';
      return fromRef === initial.toRef && toRef === initial.fromRef &&
        from === initial.toId && to === initial.fromId &&
        title.includes(' → ') && !document.querySelector('#compareSwapButton').disabled;
    }, { initial }, { timeout: 30000 });
    const after = await page.locator('#diffMeta').textContent();
    const sections = before.split(' → ');
    assert.equal(sections.length, 2, 'two comparison directions');
    assert.equal(after, sections[1] + ' → ' + sections[0], 'comparison result was really reversed');
    assert.equal(await page.locator('#diffSummary .diff-stat').count(), 3);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'no horizontal overflow after swapping on a phone');
    await page.screenshot({ path: path.join('test-results/mobile-layout', 'comparison-390-after.png'), fullPage: true });
    await page.setViewportSize({ width: 1360, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'no horizontal overflow on desktop');
    await page.screenshot({ path: path.join('test-results/mobile-layout', 'comparison-1360.png'), fullPage: true });
    assert.deepEqual(errors, [], 'no page errors');
    assert.deepEqual(outbound, [], 'no runtime data requests');
    console.log('PASS: imported PPTXVC, compact counts, detail toggle, async cross-branch swap and reversed result');
    await context.close();
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
