'use strict';
// Native Chromium check: preview the locally selected PPTX before any commit is saved.
// Tests slide navigation, language changes, preview disposal and responsive geometry.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

async function main() {
  const folder = path.resolve('test-results/mobile-layout');
  fs.mkdirSync(folder, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [locale, width] of [['ja',320], ['en',390], ['ja',1360]]) {
      const ctx = await browser.newContext({
        locale, viewport: { width, height: width < 500 ? 844 : 900 }, reducedMotion: 'reduce'
      });
      const page = await ctx.newPage(), pageErrors = [], httpRequests = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      page.on('request', request => {
        if (/^https?:/i.test(request.url())) httpRequests.push(request.url());
      });
      try {
        await page.goto(pathToFileURL(path.resolve('dist/index.html')).href);
        await page.locator('#pptxInput').setInputFiles(path.resolve('examples/sample-presentation.pptx'));
        await page.locator('#previewPanel').waitFor({ state: 'visible', timeout: 30000 });
        assert.equal(await page.locator('#previewTab').getAttribute('aria-selected'), 'true', 'preview is initial tab before a save');
        assert.equal(await page.locator('#historyTab').isVisible(), false, 'history is not actionable before initial save');
        const count = await page.locator('#previewSlideList .preview-slide-button').count();
        assert.ok(count > 0, 'slides are listed without requiring a project commit');
        await page.waitForFunction(() => {
          const host = document.querySelector('#previewHost');
          return host && host.querySelector(':scope > :not(.visual-render-fallback)') &&
            document.querySelector('#previewStatus').textContent.length > 0 &&
            !/表示しています|Rendering/.test(document.querySelector('#previewStatus').textContent);
        }, null, { timeout: 30000 });
        assert.equal(await page.locator('#previewPosition').textContent(), '1 / ' + count);
        assert.equal(await page.locator('#previewPrevButton').isDisabled(), true);
        assert.equal(await page.locator('#previewNextButton').isDisabled(), count === 1);
        const hostBox = await page.locator('#previewCanvas').boundingBox();
        assert.ok(hostBox && hostBox.width > 0 && hostBox.height > 0 && hostBox.x >= -1 &&
          hostBox.x + hostBox.width <= width + 1, 'preview canvas is fully visible');
        await page.screenshot({ path: path.join(folder, 'preview-' + locale + '-' + width + '-initial.png'), fullPage: true });

        if (count > 1) {
          await page.locator('#previewNextButton').click();
          await page.waitForFunction(() => document.querySelector('#previewPosition').textContent.startsWith('2 /'));
          assert.equal(await page.locator('[data-preview-slide="1"]').getAttribute('aria-current'), 'true');
          await page.locator('[data-preview-slide="0"]').click();
          await page.waitForFunction(() => document.querySelector('#previewPosition').textContent.startsWith('1 /'));
          assert.equal(await page.locator('[data-preview-slide="0"]').getAttribute('aria-current'), 'true');
          await page.waitForFunction(() => document.querySelector('#previewHost > :not(.visual-render-fallback)') !== null);
        }

        // A language switch must not remove or reset the selected slide.
        const selectedBefore = await page.locator('#previewPosition').textContent();
        await page.locator('#languageButton').click();
        assert.equal(await page.locator('#previewPosition').textContent(), selectedBefore);
        assert.equal(await page.locator('#previewTab').textContent(), locale === 'ja' ? 'Preview' : 'プレビュー');
        await page.waitForFunction(() => document.querySelector('#previewHost > :not(.visual-render-fallback)') !== null);
        await page.locator('#languageButton').click();

        // Saving a version exposes all peer tabs and switching away releases the view.
        await page.locator('#projectNameInput').fill('Preview regression test');
        await page.locator('#commitMessageInput').fill('Initial');
        await page.locator(width <= 760 ? '#mobileSaveVersionButton' : '#saveVersionButton').click();
        await page.locator('#historyTab').waitFor({ state: 'visible', timeout: 30000 });
        await page.locator('#historyTab').click();
        assert.equal(await page.locator('#previewPanel').isVisible(), false);
        assert.equal(await page.locator('#previewHost').evaluate(el => el.childElementCount), 0, 'rendered view disposed on tab exit');
        await page.locator('#previewTab').click();
        await page.waitForFunction(() => document.querySelector('#previewHost > :not(.visual-render-fallback)') !== null);
        assert.equal(await page.locator('#previewPanel').isVisible(), true);
        const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        assert.equal(horizontalOverflow, false, 'no document horizontal overflow');
        assert.deepEqual(pageErrors, [], 'browser page errors');
        assert.deepEqual(httpRequests, [], 'no external media/file upload requests');
        await page.screenshot({ path: path.join(folder, 'preview-' + locale + '-' + width + '-saved.png'), fullPage: true });
        console.log('PASS preview', locale, width, count, 'slides');
      } finally {
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
