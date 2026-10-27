'use strict';
// Focused native layout test. Only synthetic data; no clipboard/camera/permission use.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const cfg={"slug": "pptx-version-control", "bp": 760, "nav": null};
const evidence=path.resolve('test-results/mobile-layout');
async function bounds(locator,width,height,label,vertical=true){const r=await locator.boundingBox();assert.ok(r&&r.x>=-1&&r.x+r.width<=width+1&&(!vertical||(r.y>=-1&&r.y+r.height<=height+1)),label+': bounds '+JSON.stringify(r));}
// Check rendered geometry, including clipping by an ancestor (isVisible alone misses it).
async function auditHeader(page, label) {
  const badge = page.locator('header #versionBadge');
  assert.equal(await badge.textContent(), 'v' + require('../app.config.json').version, label + ': current header version');
  assert.equal(await badge.isVisible(), true, label + ': version visible');
  const clipped = await badge.evaluate(el => {
    const r = el.getBoundingClientRect(), problems = [];
    if (r.width <= 0 || r.height <= 0 || r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1) problems.push('outside viewport');
    if (el.scrollWidth > el.clientWidth + 1) problems.push('version text clipped');
    for (let p = el.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p), b = p.getBoundingClientRect();
      if (/hidden|clip|auto|scroll/.test(s.overflowX) && (r.left < b.left - 1 || r.right > b.right + 1)) problems.push('ancestor clips x: ' + p.className);
      if (/hidden|clip|auto|scroll/.test(s.overflowY) && (r.top < b.top - 1 || r.bottom > b.bottom + 1)) problems.push('ancestor clips y: ' + p.className);
    }
    return problems;
  });
  assert.deepEqual(clipped, [], label + ': complete header version remains readable');
  const help = page.locator('#helpButton svg');
  assert.equal(await help.isVisible(), true, label + ': Help icon visible');
  assert.ok(await help.evaluate(svg => {
    const paths = [...svg.querySelectorAll('path')], shape = paths.map(p => p.getAttribute('d')).join(' ');
    return /[aAcC]/.test(shape) && paths.some(p => /[hH]\.01/.test(p.getAttribute('d')) && getComputedStyle(p).strokeLinecap === 'round') && svg.getBBox().width > 0;
  }), label + ': question-mark curve and painted dot, not information icon');
  const shield = page.locator('.local-badge svg');
  if (await shield.count()) {
    assert.ok(await shield.evaluate(svg => [...svg.querySelectorAll('path')].some(p => /^M12 3 5 6/.test(p.getAttribute('d')))), label + ': local-processing shield');
  }
}

async function main(){fs.mkdirSync(evidence,{recursive:true});const browser=await chromium.launch();
try{const cases=[];for(const language of ['ja','en'])for(const [width,height]of [[1360,900],[cfg.bp+1,568],[cfg.bp,568],[320,568], [360,640], [390,844],[393,252]])cases.push({file:'dist/index.html',language,width,height});cases.push({file:'dist/index.self-extract.html',language:'en',width:360,height:640},{file:cfg.slug+'.html',language:'ja',width:1360,height:900});
for(const {file,language,width,height}of cases){const context=await browser.newContext({viewport:{width,height},locale:language,reducedMotion:'reduce'}),page=await context.newPage(),errors=[],requests=[],label=`${file} ${language} ${width}x${height}`;
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
try{await page.goto(pathToFileURL(path.resolve(file)).href);await page.locator('#helpButton').waitFor();
await page.waitForFunction(()=>/^\d+\.\d+\.\d+$/.test(document.querySelector('#buildVersion').textContent));
if(await page.locator('html').getAttribute('lang')!==language)await page.locator('#languageButton').click();
assert.equal((await page.locator('[data-i18n="localBadge"]').textContent()).trim(),language==='ja'?'完全ローカル処理':'Fully local processing');if(await page.locator('.local-badge').isVisible())await bounds(page.locator('.local-badge'),width,height,label,false);
assert.equal(await page.locator('main > .footer').isVisible(),width>cfg.bp,label+': informational footer');
assert.equal(await page.locator('#mobileActions').isVisible(),false,label+': initial mobile actions hidden');
if(width===320){await page.locator('#pptxInput').setInputFiles(path.resolve('examples/sample-presentation.pptx'));await page.locator('#projectState').waitFor();assert.equal(await page.locator('#mobileActions').isVisible(),true);await bounds(page.locator('#mobileActions'),width,height,label);assert.equal(await page.locator('#mobileReplaceButton').isEnabled(),true);await page.waitForFunction(()=>!document.querySelector('#mobileSaveVersionButton').disabled);assert.equal(await page.locator('#mobileSaveVersionButton').isEnabled(),true);}


if(cfg.nav){assert.equal(await page.locator(cfg.nav).isVisible(),width<=cfg.bp,label+': functional navigation');if(width<=cfg.bp)await bounds(page.locator(cfg.nav),width,height,label);}
for(const w of [cfg.bp+1,cfg.bp,width]){await page.setViewportSize({width:w,height});assert.equal(await page.locator('main > .footer').isVisible(),w>cfg.bp,label+': footer resize');}
await page.evaluate(()=>scrollTo({left:0,top:0,behavior:'instant'}));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+': page width');if(cfg.nav&&width<=cfg.bp)await bounds(page.locator(cfg.nav),width,height,label);
await auditHeader(page, label);
        if (file === 'dist/index.html' && [320,360,390,1360].includes(width)) await page.screenshot({path:path.join(evidence, `${language}-${width}-main.png`)});
        await page.locator('#helpButton').click();
        const visibleHelpText = await page.locator('#helpDialog').innerText();
        assert.doesNotMatch(visibleHelpText, /(?:EN\s*\/\s*JA|JA\s*[\/／]\s*EN|ヘッダーのEN|Use EN in the header)/, label + ': redundant language instructions removed');
const body=page.locator('#helpDialog .dialog-body'),scroll=page.locator('#helpDialog');const final=page.locator('#helpDialog #buildVersion');assert.equal(await page.locator('#buildVersion').count(),1);assert.equal(await page.locator('main #buildVersion').count(),0);await scroll.evaluate(e=>{e.scrollTop=e.scrollHeight;});const last=await body.locator('.help-build').evaluate(el=>{const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node,last;while(node=walker.nextNode())if(node.textContent.trim())last=node;const range=document.createRange();range.setStart(last,last.textContent.trimEnd().length-1);range.setEnd(last,last.textContent.trimEnd().length);const r=range.getBoundingClientRect();let top=0,bottom=innerHeight;for(let p=el.parentElement;p;p=p.parentElement)if(/auto|scroll|hidden|clip/.test(getComputedStyle(p).overflowY)){const b=p.getBoundingClientRect();top=Math.max(top,b.top);bottom=Math.min(bottom,b.bottom);}return{top:r.top,bottom:r.bottom,clipTop:top,clipBottom:bottom};});assert.ok(last.top>=last.clipTop-1&&last.bottom<=last.clipBottom+1,label+': Help end '+JSON.stringify(last));assert.ok(await body.evaluate(e=>e.scrollWidth<=e.clientWidth+1),label+': Help width');await bounds(page.locator('#helpDialog .dialog-head'),width,height,label);await bounds(page.locator('#helpDialog .dialog-head h2'),width,height,label);await bounds(page.locator('#closeHelpButton'),width,height,label);
if(file==='dist/index.html'&&[1360,320].includes(width)){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.screenshot({path:path.join(evidence,`${language}-${width}.png`)});}
const box=await page.locator('#helpDialog').boundingBox(),point=[[1,1],[width-1,1],[1,height-1],[width-1,height-1]].find(([x,y])=>x<box.x||x>box.x+box.width||y<box.y||y>box.y+box.height);assert.ok(point,label+': genuine backdrop');const y=await page.evaluate(()=>scrollY);await page.mouse.move(...point);await page.mouse.wheel(0,400);await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>scrollY),y,label+': background locked');
await page.keyboard.press('Escape');assert.equal(await page.locator('#helpDialog').isVisible(),false);await page.locator('#languageButton').click();await page.locator('#languageButton').click();assert.equal(await page.locator('#buildVersion').count(),1);await page.locator('#helpButton').click();await page.locator('#closeHelpButton').click();assert.equal(await page.locator('#helpDialog').isVisible(),false);
assert.deepEqual(errors,[],label+': console errors');assert.deepEqual(requests,[],label+': runtime requests');console.log('PASS '+label);
}catch(e){await page.screenshot({path:path.join(evidence,'failure.png')}).catch(()=>{});throw new Error(label+': '+e.message,{cause:e});}finally{await context.close();}}
}finally{await browser.close();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
