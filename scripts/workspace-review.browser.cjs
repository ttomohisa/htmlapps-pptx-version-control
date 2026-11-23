'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
async function main(){
 fs.mkdirSync('test-results/mobile-layout',{recursive:true});
 const browser=await chromium.launch({headless:true});
 try {
  for(const [locale,width] of [['ja',320],['en',390],['ja',1360]]){
   const context=await browser.newContext({locale,viewport:{width,height:width<500?844:900},reducedMotion:'reduce'});
   const page=await context.newPage(),errors=[],requests=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('request',r=>{if(/^https?:/i.test(r.url()))requests.push(r.url())});
   try {
    await page.goto(pathToFileURL(path.resolve('dist/index.html')).href);
    await page.locator('#projectImportInput').setInputFiles(path.resolve('test/fixtures/merge-lineage.pptxvc'));
    await page.locator('#projectState').waitFor({state:'visible',timeout:30000});
    await page.locator('#historyTab').click();
    const rows=page.locator('#historyList .history-row'),before=await rows.count();
    assert.ok(before>=2,'fixture has saved versions');
    const title=(await rows.first().locator('.history-message').textContent()).trim();
    await page.locator('#historySearchInput').fill(title);
    const matched=await rows.count();
    assert.ok(matched>0&&matched<=before,'version search filters saved rows');
    await page.locator('#historySearchInput').fill('nonexistent-search-9ba4');
    assert.equal(await rows.count(),0);
    assert.equal(await page.locator('#historyList .repo-empty').count(),1,'no matches message');
    await page.locator('#historySearchInput').fill('');
    assert.equal(await rows.count(),before,'clearing search restores entries');
    await page.locator('#diffTab').click();
    await page.waitForFunction(()=>document.querySelector('#compareFromSelect')?.options.length>=2);
    await page.locator('#compareToBranchSelect').selectOption('refs/heads/audit-incoming');
    await page.waitForFunction(()=>document.querySelector('#compareToSelect')?.options.length===2);
    await page.locator('#compareFromSelect').selectOption({index:0});
    await page.locator('#compareToSelect').selectOption({index:0});
    await page.waitForFunction(()=>{const a=document.querySelector('#compareFromSelect')?.value,b=document.querySelector('#compareToSelect')?.value;return a&&b&&a!==b&&!document.querySelector('#compareVersionsButton').disabled});
    await page.locator('#compareVersionsButton').click();
    await page.waitForFunction(()=>!document.querySelector('#diffContent').hidden&&!!document.querySelector('#compareSlideList .compare-slide-row'),null,{timeout:30000});
    assert.equal(await page.locator('#changeReviewToolbar').isVisible(),true,'change navigation visible');
    const initial=await page.locator('#changeReviewPosition').textContent();
    assert.ok(/\d+ \/ \d+/.test(initial),'change counter');
    if(await page.locator('#nextChangeButton').isEnabled()){
      const old=await page.locator('.compare-slide-row[aria-current="true"]').getAttribute('data-pair-index');
      await page.locator('#nextChangeButton').click();
      await page.waitForFunction(previous=>document.querySelector('.compare-slide-row[aria-current="true"]')?.dataset.pairIndex!==previous,old);
      assert.notEqual(await page.locator('#changeReviewPosition').textContent(),initial,'moved to next changed slide');
    }
    await page.locator('#historyTab').focus();await page.keyboard.press('End');
    await page.waitForFunction(()=>document.querySelector('#previewTab').getAttribute('aria-selected')==='true');
    const visible=()=>page.locator('#previewTab').evaluate(el=>{const a=el.getBoundingClientRect(),b=el.parentElement.getBoundingClientRect();return a.left>=b.left-1&&a.right<=b.right+1});
    assert.ok(await visible(),'selected phone tab visible');
    await page.locator('#languageButton').click();
    await page.waitForFunction(()=>document.querySelector('#projectTabsWrap').dataset.canScrollRight!==undefined);
    assert.ok(await visible(),'selected tab visible after locale switch');
    await page.locator('#previewTab').focus();await page.keyboard.press('Home');
    await page.waitForFunction(()=>document.querySelector('#historyTab').getAttribute('aria-selected')==='true');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no document overflow');
    assert.deepEqual(errors,[],'no browser errors');assert.deepEqual(requests,[],'no HTTP requests');
    await page.screenshot({path:path.join('test-results/mobile-layout',`workspace-review-${locale}-${width}.png`),fullPage:true});
    console.log('PASS workspace review',locale,width);
   }finally{await context.close()}
  }
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
