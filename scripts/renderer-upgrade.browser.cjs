'use strict';
// Actual Chromium smoke test for bundled renderer 1.4.0 and app's no-network integration.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const template = fs.readFileSync(path.resolve('src/index.template.html'), 'utf8');
const wrapperLine = template.split('\n').find(line => line.startsWith('function renderPreparedSlide('));
assert.ok(wrapperLine, 'app renderPreparedSlide function must exist');
const state = { rendererHandles: new Set() };
const renderPreparedSlide = vm.runInNewContext(wrapperLine + '; renderPreparedSlide', {
  state,
  rendererSlideNumber: x => typeof x === 'number' ? x : 1,
  Date,
  console
});
const slide = { index: 1 };
let captured = null;
const moduleStub = { renderSlide: (presentation, target, options) => {
  captured = options;
  assert.equal(target, slide);
  return { dispose() {} };
}};
const prepared = {
  presentation: { slides: [slide] },
  module: moduleStub,
  mediaUrlCache: new Map(),
  lastUsed: 0,
  disposed: false
};
const handle = renderPreparedSlide(prepared, 1);
assert.equal(captured.externalMedia, 'block', 'Browser Kitty must never load external PPTX media');
assert.equal(captured.pdfjs, false, 'offline PDF fallback remains disabled');
assert.equal(state.rendererHandles.size, 1);
handle.dispose();
assert.equal(state.rendererHandles.size, 0);

const fixture = JSON.parse(fs.readFileSync(path.resolve('test/fixtures/merge-lineage.pptxvc'), 'utf8'));
const pkg = fixture.objects.find(object => object.kind === 'pptx');
assert.ok(pkg?.data, 'synthetic PPTX fixture exists');

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [width, height] of [[1360, 900], [390, 844]]) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
      try {
        const page = await context.newPage();
        const requests = [];
        page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
        await page.goto(pathToFileURL(path.resolve('dist/index.html')).href);
        await page.locator('#versionBadge').waitFor();
        const result = await page.evaluate(async base64 => {
          const assets = window.StandaloneAssets;
          if (!assets?.has('pptx-renderer', 'browser')) throw new Error('Bundled renderer asset absent');
          const url = await assets.blobUrlAsync('pptx-renderer', 'browser');
          const renderer = await import(url);
          if (!renderer.renderSlide || !renderer.RECOMMENDED_ZIP_LIMITS) throw new Error('Renderer 1.4 API missing');
          const bytes = Uint8Array.from(atob(base64), ch => ch.charCodeAt(0));
          const files = await renderer.parseZip(bytes.buffer, renderer.RECOMMENDED_ZIP_LIMITS);
          const presentation = renderer.buildPresentation(files);
          if (!presentation.slides?.length) throw new Error('PPTX fixture did not produce slides');
          const handle = renderer.renderSlide(presentation, presentation.slides[0], {
            externalMedia: 'block',
            pdfjs: false,
            mediaUrlCache: new Map()
          });
          document.body.append(handle.element);
          try {
            await handle.ready;
            const rect = handle.element.getBoundingClientRect();
            const textNode = [...handle.element.querySelectorAll('*')].reverse().find(el => el.textContent?.trim() === 'Synthetic audit');
            const textColor = textNode ? getComputedStyle(textNode).color : '';
            const textFill = textNode ? getComputedStyle(textNode).fill : '';
            return {
              slides: presentation.slides.length,
              width: rect.width,
              height: rect.height,
              children: handle.element.querySelectorAll('*').length,
              visibleText: handle.element.textContent?.trim().slice(0, 120),
              textColor, textFill
            };
          } finally {
            handle.dispose();
            handle.element.remove();
          }
        }, pkg.data);
        assert.ok(result.slides > 0, 'slides parsed');
        assert.ok(result.width > 0 && result.height > 0, 'slide has visible geometry');
        assert.ok(result.children > 0, 'slide is rendered with actual DOM nodes');
        assert.match(result.visibleText || '', /Synthetic audit/, 'fixture title text must render');
        assert.deepEqual(requests, [], 'no HTTP requests during PPTX rendering');
        console.log('PASS renderer 1.4 Chromium ' + width + 'x' + height +
          ', slides=' + result.slides + ', dom nodes=' + result.children + ', title color=' + result.textColor + ', title fill=' + result.textFill);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
