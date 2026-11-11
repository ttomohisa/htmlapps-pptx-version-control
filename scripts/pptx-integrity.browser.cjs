'use strict';
// Browser-level OOXML merge checks with synthetic, non-sensitive slide XML.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const html = fs.readFileSync('src/index.template.html', 'utf8');
const line = prefix => {
  const matches = html.split('\n').filter(part => part.startsWith(prefix));
  assert.equal(matches.length, 1, 'source function ' + prefix);
  return matches[0];
};
const between = (start, end) => {
  const a = html.indexOf(start), b = html.indexOf(end, a + start.length);
  assert.ok(a !== -1 && b > a, start);
  return html.slice(a, b);
};

const testCode = [
  line('function mergeSingleRunText('),
  line('function mergeSingleRunFormatting('),
  line('function slideHasUniqueObjectIds('),
  line('function relativeObjectOrderUnchanged('),
  line('function setTextContentInObject('),
  between('async function materializeMixedSlide(', 'async function ensureContentTypes('),
  between('async function slideAncillarySignature(', 'function verifyMaterializedMerge('),
  line('function escapeXml('),
  line('function canonicalizeXml('),
  line('function normalizePart('),
  line('function relationshipMap('),
  line('function relationshipsPathForPart(')
].join('\n');

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto('about:blank');
    const results = await page.evaluate(async source => {
      const assert = Object.assign((value,msg) => { if (!value) throw new Error(msg || 'Assertion failed'); }, {
        equal: (a,b,msg) => { if (a !== b) throw new Error((msg || 'Values differ') + ': ' + String(a) + ' !== ' + String(b)); },
        notEqual: (a,b,msg) => { if (a === b) throw new Error((msg || 'Values unexpectedly match') + ': ' + String(a)); }
      });
      const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
      const VOLATILE_ATTRS = new Set(['dirty', 'smtClean']);
      const local = (root, name) => root ? [...root.children].find(c => c.localName === name) || null : null;
      const nodesByLocal = (root, name) => [...(root?.getElementsByTagNameNS('*', name) || [])];
      const directByLocal = local;
      const firstByLocal = (root, name) => nodesByLocal(root, name)[0] || null;
      const directChildren = root => [...(root?.children || [])];
      const stableStringify = value => JSON.stringify(value);
      const semEqual = (a, b) => stableStringify(a ?? null) === stableStringify(b ?? null);
      const parseXml = text => text ? new DOMParser().parseFromString(text, 'application/xml') : null;
      const readZipText = async (zip, path) => zip.files[path] ?? null;
      const resolveSlideInfo = async (_, slide) => ({ path: slide.path, sourceId: slide.sourceId, notesPath: '' });
      const findObjectNodeBySourceId = (doc, id) => {
        for (const n of nodesByLocal(doc, 'sp')) {
          if (firstByLocal(n, 'cNvPr')?.getAttribute('id') === String(id)) return n;
        }
        return null;
      };
      const replaceXmlNode = (target, source) => {
        if (!target || !source) return false;
        target.replaceWith(source.cloneNode(true));
        return true;
      };
      const materialConflicts = [];
      const code = new Function('nodesByLocal','directByLocal','firstByLocal','directChildren','stableStringify',
        'semEqual','parseXml','readZipText','resolveSlideInfo','findObjectNodeBySourceId','replaceXmlNode',
        'REL_NS','VOLATILE_ATTRS',source +
        '\nreturn { materializeMixedSlide, slideAncillarySignature, setTextContentInObject };');
      const api = code(nodesByLocal,directByLocal,firstByLocal,directChildren,stableStringify,
        semEqual,parseXml,readZipText,resolveSlideInfo,findObjectNodeBySourceId,replaceXmlNode,REL_NS,VOLATILE_ATTRS);
      const escape = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;');
      const shape = (id,text,bold,fill,align='l',font=12) =>
        '<p:sp><p:nvSpPr><p:cNvPr id="'+id+'" name="Shape '+id+'"/></p:nvSpPr>'+
        '<p:spPr><a:solidFill><a:srgbClr val="'+fill+'"/></a:solidFill></p:spPr>'+
        '<p:txBody><a:bodyPr/><a:p><a:pPr algn="'+align+'"/><a:r>'+
        '<a:rPr b="'+(bold ? 1 : 0)+'" sz="'+font*100+'"/><a:t>'+escape(text)+'</a:t>'+
        '</a:r></a:p></p:txBody></p:sp>';
      const documentXml = (shapeXml,transition='') =>
        '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" '+
        'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'+
        '<p:cSld><p:spTree>'+shapeXml+'</p:spTree></p:cSld>'+transition+'</p:sld>';
      const path = 'ppt/slides/slide1.xml', info = { path, sourceId: '256' };
      const makePkg = xml => ({ zip: { files: { [path]: xml } } });
      const op = (base, ours, theirs, source, groupSources) => ({
        key:'slide:s1:o1', base, ours, theirs, merged:{ ...ours, text:theirs.text }, source, groupSources
      });
      const b = { sourceId: '2', text: 'Original', formatting:{ bold:false,fill:'FFFFFF' },textLayout:{align:'l'},hyperlinks:[] };
      const o = { ...b, formatting:{bold:true,fill:'FFFFFF'} };
      const t = { ...b, text: 'New heading', formatting:{bold:false,fill:'0000FF'} };
      const firstPlan = { key:'slide:s1',base:info,ours:info,theirs:info,notesSource:'ours',
        themeSource:'ours',objectPlans:[op(b,o,t,'mixed',{
          text:'theirs',formatting:'mixed',formattingKeys:{bold:'ours',fill:'theirs'},
          textLayout:'both',resource:'both',geometry:'both'})] };
      const changes = new Map();
      const ok = await api.materializeMixedSlide(firstPlan,
        makePkg(documentXml(shape(2,'Original',true,'FFFFFF'))),
        makePkg(documentXml(shape(2,'New heading',false,'0000FF'))),
        makePkg(documentXml(shape(2,'Original',false,'FFFFFF'))),
        changes,materialConflicts);
      assert(ok && materialConflicts.length===0,'text/style mixed merge reports no conflicts');
      const mergedDoc = parseXml(new TextDecoder().decode(changes.get(path)));
      assert.equal(firstByLocal(mergedDoc,'t').textContent, 'New heading','incoming text survives');
      assert.equal(firstByLocal(mergedDoc,'rPr').getAttribute('b'), '1','current bold survives');
      assert.equal(firstByLocal(mergedDoc,'srgbClr').getAttribute('val'), '0000FF','incoming fill survives');

      const base2 = { ...b, formatting:{fontSize:12,fill:'FFFFFF'},textLayout:{align:'l'} };
      const ours2 = { ...base2, textLayout:{align:'ctr'} };
      const theirs2 = { ...base2, formatting:{fontSize:16,fill:'FFFFFF'} };
      const second = { key:'slide:s1',base:info,ours:info,theirs:info,notesSource:'ours',
        themeSource:'ours',objectPlans:[op(base2,ours2,theirs2,'mixed',{
          text:'both',formatting:'theirs',textLayout:'ours',resource:'both',geometry:'both'})] };
      const edits = new Map(), conflicts2=[];
      const okay2=await api.materializeMixedSlide(second,
        makePkg(documentXml(shape(2,'Original',false,'FFFFFF','ctr',12))),
        makePkg(documentXml(shape(2,'Original',false,'FFFFFF','l',16))),
        makePkg(documentXml(shape(2,'Original',false,'FFFFFF','l',12))),edits,conflicts2);
      assert(okay2 && conflicts2.length===0,'formatting and paragraph align merge');
      const merged2=parseXml(new TextDecoder().decode(edits.get(path)));
      assert.equal(firstByLocal(merged2,'rPr').getAttribute('sz'),'1600','incoming font size survives');
      assert.equal(firstByLocal(merged2,'pPr').getAttribute('algn'),'ctr','current center align survives');

      const conflictLink=[],linkEdits=new Map();
      const tLink={...t,hyperlinks:[{kind:'hlinkClick',target:'https://example.com/new'}]};
      const linkPlan={key:'slide:s1',base:info,ours:info,theirs:info,notesSource:'ours',objectPlans:[
        {key:'s1:o1',source:'theirs',base:b,ours:o,theirs:tLink,merged:tLink}]};
      await api.materializeMixedSlide(linkPlan,
        makePkg(documentXml(shape(2,'Original',true,'FFFFFF'))),
        makePkg(documentXml(shape(2,'New heading',false,'0000FF'))),
        makePkg(documentXml(shape(2,'Original',false,'FFFFFF'))),linkEdits,conflictLink);
      assert(conflictLink.length>0,'linked object copy must refuse to drop rels');

      const duplicate=[],duplicates=new Map();
      const duplicatePlan={key:'slide:s1',base:info,ours:info,theirs:info,notesSource:'ours',objectPlans:[
        {key:'s1:added',source:'theirs',ours:null,theirs:{sourceId:'2',hyperlinks:[]},merged:{sourceId:'2'}}]};
      await api.materializeMixedSlide(duplicatePlan,
        makePkg(documentXml(shape(2,'Original',false,'FFFFFF'))),
        makePkg(documentXml(shape(2,'New shape',false,'0000FF'))),
        makePkg(documentXml(shape(2,'Original',false,'FFFFFF'))),duplicates,duplicate);
      assert(duplicate.some(c=>/Duplicate shape/.test(c.detail)),'duplicate cNvPr id must be rejected');

      const table=parseXml('<p:graphicFrame xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'+
        '<a:tbl><a:tr><a:tc><a:txBody><a:p><a:r><a:t>One</a:t></a:r></a:p></a:txBody></a:tc>'+
        '<a:tc><a:txBody><a:p><a:r><a:t>Two</a:t></a:r></a:p></a:txBody></a:tc></a:tr></a:tbl></p:graphicFrame>');
      assert.equal(api.setTextContentInObject(table.documentElement,'Replaced'),false,'table multi-cell edit must fail closed');

      const auxOld=documentXml(shape(2,'Base',false,'FFFFFF'));
      const auxFade=documentXml(shape(2,'Changed',false,'FFFFFF'),'<p:transition><p:fade/></p:transition>');
      const auxWipe=documentXml(shape(2,'Changed',false,'FFFFFF'),'<p:transition><p:wipe/></p:transition>');
      const auxA=await api.slideAncillarySignature(makePkg(auxOld),info);
      const auxB=await api.slideAncillarySignature(makePkg(auxFade),info);
      const auxC=await api.slideAncillarySignature(makePkg(auxWipe),info);
      assert.notEqual(auxA,auxB,'transition change detected');
      assert.notEqual(auxB,auxC,'conflicting transition change detected');
      return { result: 'PASS', checks: [
        'text + bold + fill actual OOXML', 'font size + alignment actual OOXML',
        'hyperlink relationships fail closed','duplicate cNvPr IDs fail closed',
        'table manual edits fail closed','unsupported transition XML detected'
      ] };
    }, testCode);
    assert.equal(results.result,'PASS');
    console.log('PASS native Chromium PPTX merge assertions:\n' + results.checks.map(x=>' - '+x).join('\n'));
  } finally { await browser.close(); }
}

main().catch(error=>{console.error(error);process.exitCode=1;});
