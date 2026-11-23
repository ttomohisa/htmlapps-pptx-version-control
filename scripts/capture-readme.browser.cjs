'use strict';
// Capture current rendered comparison UI with the checked-in synthetic fixture.
// Artifacts are saved only to the CI screenshot folder, never to user storage.
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
    const fs=require('node:fs'),outDir=path.resolve('test-results/mobile-layout');
    fs.mkdirSync(outDir,{recursive:true});
    fs.writeFileSync(path.join(outDir,'readme-'+locale+'.png'),png);
    console.log('CAPTURED readme-'+locale+'.png ('+png.length+' bytes)');
   }finally{await ctx.close()}
  }
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
