'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');

async function main() {
  const html = fs.readFileSync(process.argv[2] || 'dist/index.html', 'utf8');
  const source = html.replace("const drop=$('#dropZone');", "window.bgTest={state,parsePresentation,readZipText,buildZipWithChanges,semanticSnapshot,semanticForCommit,compareSemanticSnapshots,makeObjectRecord,repoWrite,threeWayMergeSemantic,materializeMerge};const drop=$('#dropZone');");
  const browser = await chromium.launch({headless:true, ...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {})});
  try {
    const page = await browser.newPage({locale:'en-US'});
    await page.route('http://localhost/background-test', route => route.fulfill({contentType:'text/html', body:source}));
    await page.goto('http://localhost/background-test');
    await page.locator('#pptxInput').setInputFiles('examples/sample-presentation.pptx');
    await page.locator('#saveVersionButton').click();
    await page.waitForFunction(() => window.bgTest.state.history.length===1 && !window.bgTest.state.busy);
    const transformed=await page.evaluate(async()=>{
      const {state,readZipText,buildZipWithChanges,parsePresentation,compareSemanticSnapshots}=window.bgTest;
      const zip=state.model._zip,path='ppt/slides/slide2.xml',xml=await readZipText(zip,path);
      async function solid(rgb,children){
        const bg='<p:bg><p:bgPr><a:solidFill><a:srgbClr val="'+rgb+'">'+children+'</a:srgbClr></a:solidFill></p:bgPr></p:bg>';
        const part=new TextEncoder().encode(xml.replace('<p:spTree>',bg+'<p:spTree>'));
        return parsePresentation(new File([buildZipWithChanges(zip,new Map([[path,part]]))],'color.pptx'));
      }
      const tint='<a:tint val="50000"/>',shade='<a:shade val="50000"/>';
      const models=await Promise.all([solid('FF0000',tint),solid('0000FF',tint),solid('0000FF',tint+shade),solid('0000FF',shade+tint)]);
      const result=compareSemanticSnapshots(models[0],models[1]);
      return {colors:models.map(model=>model.slides[1].backgroundColor),formatting:result.summary.formatting};
    });
    assert.equal(transformed.formatting,1,'tinted red and tinted blue are a formatting change');
    assert.deepEqual(transformed.colors,['#FFBCBC','#BCBCFF','#8989BC','#BCBCE1'],'DrawingML tint and shade are applied in XML order in linear RGB');
    const variations = await page.evaluate(async () => {
      const {state,readZipText,buildZipWithChanges}=window.bgTest;
      const slide='ppt/slides/slide2.xml',zip=state.model._zip;
      const xml=await readZipText(zip,slide);
      const yellow='<p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFE066"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>';
      const xmlFile = text => Array.from(buildZipWithChanges(zip,new Map([[slide,new TextEncoder().encode(text)]])));
      return {
        yellow:xmlFile(xml.replace('<p:spTree>',yellow+'<p:spTree>')),
        edit:xmlFile(xml.replace(/<a:t>([^<]*)<\/a:t>/,'<a:t>Edited $1</a:t>')),
        equivalent:xmlFile(xml.replace('<p:spTree>',yellow.replace('FFE066','FFFFFF')+'<p:spTree>'))
      };
    });
    const upload = async (name,bytes) => {
      await page.locator('#pptxInput').setInputFiles({name,buffer:Buffer.from(bytes),mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation'});
      await page.waitForFunction(n=>window.bgTest.state.model?.filename===n && !window.bgTest.state.busy,name);
    };
    await upload('equivalent.pptx',variations.equivalent);
    assert.ok(await page.locator('#workingCompareButton').isVisible(),'a different file with equivalent colors can be reviewed');
    await page.locator('#workingCompareButton').click();
    await page.waitForFunction(()=>window.bgTest.state.compareSession?.to.filename==='equivalent.pptx');
    assert.equal(await page.evaluate(()=>window.bgTest.state.compareSession.result.summary.changedSlides),0);
    await upload('yellow.pptx',variations.yellow);
    await page.locator('#workingCompareButton').click();
    await page.waitForFunction(()=>window.bgTest.state.compareSession?.to.filename==='yellow.pptx');
    const counts=await page.evaluate(()=>window.bgTest.state.compareSession.result.summary);
    assert.equal(counts.changedSlides,1);
    assert.equal(counts.formatting,1);
    await page.locator('#reviewFilters > summary').click();
    await page.locator('[data-compare-filter="formatting"]').click();
    assert.equal(await page.locator('.compare-slide-row').count(),1);
    const card=await page.locator('#visualSemanticList').textContent();
    assert.match(card,/Slide background/);
    assert.match(card,/#FFFFFF/);
    assert.match(card,/#FFE066/);
    assert.equal(await page.locator('.visual-marker').count(),0);
    await page.waitForFunction(()=>document.querySelector('#visualFromHost')?.dataset.visualState==='ready' && document.querySelector('#visualToHost')?.dataset.visualState==='ready');
    const merged=await page.evaluate(async bytes=>{
      const {state,parsePresentation,semanticSnapshot,semanticForCommit,makeObjectRecord,repoWrite,threeWayMergeSemantic,materializeMerge}=window.bgTest;
      const baseCommit=state.history[0],base=await semanticForCommit(baseCommit),theirs=semanticSnapshot(state.model);
      async function record(file,snapshot) {
        const pkg=await makeObjectRecord('pptx',file),sem=await makeObjectRecord('semantic',JSON.stringify(snapshot),'application/json');
        const tree=await makeObjectRecord('tree',JSON.stringify({package:{object:pkg.id,filename:file.name},semantic:{object:sem.id}}),'application/json');
        await repoWrite({objects:[pkg,sem,tree]});
        return {tree:tree.id,sourceFileName:file.name,sourceSha256:pkg.id};
      }
      const oursFile=new File([Uint8Array.from(bytes)],'text.pptx'),oursModel=await parsePresentation(oursFile),ours=semanticSnapshot(oursModel);
      const legacy=structuredClone(ours);
      for(const s of legacy.slides)delete s.backgroundColor;
      const oursCommit=await record(oursFile,legacy),theirsCommit=await record(state.file,theirs);
      const recovered=await semanticForCommit(oursCommit);
      const semantic=threeWayMergeSemantic(base,recovered,theirs);
      const output=await materializeMerge({baseCommit,oursCommit,theirsCommit,semantic});
      return {recovered:recovered.slides[1].backgroundColor,conflicts:output.materialConflicts||semantic.conflicts,color:output.model?.slides[1].backgroundColor,text:output.model?.slides[1].objects.map(o=>o.text).join('\n')};
    },variations.edit);
    assert.equal(merged.recovered,'#FFFFFF');
    assert.deepEqual(merged.conflicts,[]);
    assert.equal(merged.color,'#FFE066');
    assert.match(merged.text,/Edited /);
    await page.locator('#compareChangedOnlyButton').click();
    await upload('equivalent-again.pptx',variations.equivalent);
    await page.locator('#workingCompareButton').click();
    await page.waitForFunction(()=>window.bgTest.state.compareSession?.to.filename==='equivalent-again.pptx');
    assert.equal(await page.locator('.compare-slide-row').count(),2,'a previous filter must not hide every slide in a new comparison');
    console.log('PASS inherited white, explicit yellow, equivalent file, slide-level card, pre-save render, legacy history and mixed PPTX merge');
  } finally {
    await browser.close();
  }
}
main().catch(err=>{ console.error(err);process.exitCode=1; });
