import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const source=fs.readFileSync(new URL('../src/index.template.html',import.meta.url),'utf8');
const lines=source.split('\n'),extract=name=>{const line=lines.find(s=>s.startsWith('function '+name+'('));assert.ok(line,name);return line};
function setup(){
 const state={compareSession:{slidePairs:[
  {changed:false,categoryCounts:{text:0}},
  {changed:true,categoryCounts:{text:2}},
  {changed:false,categoryCounts:{text:0}},
  {changed:true,categoryCounts:{text:0}},
  {changed:true,categoryCounts:{text:1}}
 ]},compareFilter:'all',compareChangedOnly:false,visualSelectedPair:1};
 const c={state};vm.createContext(c);vm.runInContext(['historySearchMatches','pairMatchesFilter','visibleComparisonIndexes','changedReviewIndexes','changedReviewTarget'].map(extract).join('\n'),c);return c;
}
test('search matches saved name, original note, filename, date and version, case-insensitively',()=>{
 const {historySearchMatches:match}=setup(),item={label:'Budget Review',message:'四半期 最終版',sourceFileName:'報告資料2026.pptx',createdAt:'2026-11-20',id:'abcdef'};
 assert.equal(match(item,0,5,'ＢＵＤＧＥＴ'),true);
 assert.equal(match(item,0,5,'四半期 報告資料'),true);
 assert.equal(match(item,0,5,'v5'),true);
 assert.equal(match(item,0,5,'2026-11-20'),true);
 assert.equal(match(item,0,5,'missing'),false);
 assert.equal(match(item,0,5,' '),true);
});
test('changed-review traversal ignores unchanged slides and respects comparison filters',()=>{
 const c=setup();
 assert.deepEqual(Array.from(c.changedReviewIndexes()),[1,3,4]);
 assert.equal(c.changedReviewTarget(-1),null);assert.equal(c.changedReviewTarget(1),3);
 c.state.visualSelectedPair=3;assert.equal(c.changedReviewTarget(-1),1);assert.equal(c.changedReviewTarget(1),4);
 c.state.compareFilter='text';assert.deepEqual(Array.from(c.changedReviewIndexes()),[1,4]);
 assert.equal(c.changedReviewTarget(-1),1);assert.equal(c.changedReviewTarget(1),4);
 c.state.visualSelectedPair=4;assert.equal(c.changedReviewTarget(1),null);
 c.state.compareFilter='all';c.state.compareChangedOnly=true;
 assert.deepEqual(Array.from(c.visibleComparisonIndexes()),[1,3,4]);
});
