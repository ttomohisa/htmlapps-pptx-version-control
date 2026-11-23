'use strict';
// One-off release screenshot capture with a synthetic PPTXVC test fixture.
// The base64 stream is emitted solely so a read-only CI run can supply
// screenshots without giving pull-request code write credentials.
const {chromium}=require('playwright');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
async function main(){
 const browser=await chromium.launch();
 try{
  for(const locale of ['ja','en']){
   const ctx=await browser.newContext({locale,viewport:{width:1360,height:900},deviceScaleFactor:1,reducedMotion:'reduce'});
   const page=await ctx.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.goto(pathToFileURL(path.resolve('dist/index.html')).href);
    await page.locator('#projectImportInput').setInputFiles(path.resolve('test/fixtures/merge-lineage.pptxvc'));
    await page.locator('#projectState').waitFor({state:'visible',timeout:30000});
    await page.locator('#diffTab').click();
    await page.waitForFunction(()=>document.querySelector('#compareFromSelect')?.options.length>=2);
    await page.locator('#compareToBranchSelect').selectOption('refs/heads/audit-incoming');
    await page.waitForFunction(()=>document.querySelector('#compareToSelect')?.options.length===2);
    await page.locator('#compareFromSelect').selectOption({index:0});
    await page.locator('#compareToSelect').selectOption({index:0});
    await page.waitForFunction(()=>{const a=document.querySelector('#compareFromSelect')?.value,b=document.querySelector('#compareToSelect')?.value;return a&&b&&a!==b&&!document.querySelector('#compareVersionsButton').disabled});
    await page.locator('#compareVersionsButton').click();
    await page.waitForFunction(()=>{const status=document.querySelector('#visualRenderStatus')?.textContent||'';return !document.querySelector('#diffContent').hidden && /見た目比較を表示|Visual comparison is ready|Semantic changes are still available|差分情報は確認/.test(status)},null,{timeout:60000});
    await page.waitForFunction(()=>!document.querySelector('#appToast')?.classList.contains('show'),null,{timeout:10000});
    await page.waitForTimeout(200);
    await page.evaluate(()=>{const el=document.querySelector('#diffSummary');const y=window.scrollY+el.getBoundingClientRect().top-145;window.scrollTo({top:Math.max(0,y),behavior:'instant'})});
    await page.waitForTimeout(200);
    if(errors.length)throw Error(errors.join('; '));
    const png=await page.screenshot({type:'png',fullPage:false,animations:'disabled'});
    const base64=png.toString('base64'),chunkSize=4000,total=Math.ceil(base64.length/chunkSize);
    console.log('BKSCREEN_BEGIN:'+locale+':'+base64.length+':'+total);
    for(let i=0;i<total;i++)console.log('BKSCREEN_PART:'+locale+':'+i+':'+base64.slice(i*chunkSize,(i+1)*chunkSize));
    console.log('BKSCREEN_END:'+locale);
   }finally{await ctx.close()}
  }
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
