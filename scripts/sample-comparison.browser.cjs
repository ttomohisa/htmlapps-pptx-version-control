'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');

async function repositoryKeys(page) {
  return page.evaluate(async () => {
    const read = request => new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const db = await read(indexedDB.open('pptx-version-control-local-repository'));
    try {
      const stores = Array.from(db.objectStoreNames);
      const tx = db.transaction(stores);
      return await Promise.all(stores.map(name => read(tx.objectStore(name).getAllKeys())));
    } finally {
      db.close();
    }
  });
}

async function main() {
  const browser = await chromium.launch({executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
  try {
    for (const [locale, width] of [['en', 1360], ['ja', 320]]) {
      const context = await browser.newContext({locale, viewport: {width, height: 900}, offline: true});
      try {
        const page = await context.newPage();
        const errors = [], requests = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => { if (/^https?:/i.test(request.url())) requests.push(request.url()); });
        await page.goto(pathToFileURL(path.resolve(process.argv[2] || 'dist/index.html')).href);
        const open = page.locator('#openSampleButton');
        assert.equal(await open.isVisible(), true, 'home offers a one-click sample');
        const before = await repositoryKeys(page);
        for (let visit = 0; visit < 2; visit++) {
          await open.focus();
          await page.keyboard.press('Enter');
          await page.locator('#sampleState #visualFromHost[data-visual-state="ready"]').waitFor();
          await page.locator('#sampleState #visualToHost[data-visual-state="ready"]').waitFor();
          const selected = page.locator('.compare-slide-row[aria-current="true"]');
          assert.match(await selected.textContent(), /Revenue/);
          assert.match(await page.locator('#visualFromHost').textContent(), /FY2027:\s*145/);
          assert.match(await page.locator('#visualToHost').textContent(), /FY2027:\s*165/);
          assert.equal(await page.locator('#saveVersionButton').isVisible(), false);
          assert.equal(await page.locator('#mobileActions').isVisible(), false);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
          await page.locator('#languageButton').click();
          assert.match(await page.locator('#diffMeta').innerText(), /1.*2/);
          assert.equal(await page.locator('#reviewNewValue').innerText(), '165');
          const titleBox = await page.locator('#reviewDelta').boundingBox();
          const frameBox = await page.locator('#visualFromFrame').boundingBox();
          assert.ok(titleBox.y >= 0 && frameBox.y + 80 < 700, 'delta and slide are in the initial viewport');
          if (width <= 760) {
            await page.locator('#reviewSlidePicker > summary').click();
          }
          await page.locator('.compare-slide-row[data-pair-index="0"]').click();
          assert.equal(await page.locator('#reviewDelta').isVisible(), false, 'old numbers clear on an unchanged slide');
          assert.match(await page.locator('#visualCompareTitle').innerText(), /Quarterly/);
          await page.locator('#sampleBackButton').click();
          assert.equal(await open.isVisible(), true);
          assert.equal(await open.evaluate(el => el === document.activeElement), true);
        }
        assert.deepEqual(await repositoryKeys(page), before, 'sample visits preserve every repository store');
        await page.locator('#pptxInput').setInputFiles(path.resolve('examples/sample-presentation.pptx'));
        await page.locator('#previewPanel').waitFor();
        assert.equal(await page.locator('#diffPanel #diffContent').count(), 1);
        assert.deepEqual(requests, []);
        assert.deepEqual(errors, []);
        console.log('PASS offline sample comparison', locale, width);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
main().catch(error => {console.error(error); process.exitCode = 1;});
