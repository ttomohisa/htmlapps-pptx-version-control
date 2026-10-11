import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';

// Actual matchers and merge planning, with the exact synthetic three-commit
// native-browser export that reproduced the empty-presentation failure.
// No IndexedDB, XML materialization or native dialog behavior is simulated here.
const root = new URL('../', import.meta.url);
const target = process.argv[2] || 'src/index.template.html';
let source = fs.readFileSync(path.isAbsolute(target) ? target : new URL(target, root), 'utf8');
if (target.includes('self-extract')) {
  const payload = source.match(/<script id="self-extract-payload" type="application\/octet-stream">([\s\S]*?)<\/script>/);
  assert.ok(payload);
  source = gunzipSync(Buffer.from(payload[1], 'base64')).toString('utf8');
}
const fixtureBytes = fs.readFileSync(new URL('test/fixtures/merge-lineage.pptxvc', root));
const fixture = JSON.parse(fixtureBytes);
const objects = new Map(fixture.objects.map(o => [o.id, o]));
const jsonObject = id => JSON.parse(Buffer.from(objects.get(id).data, 'base64'));
const commit = suffix => fixture.commits.find(c => c.sourceFileName === `pptx-audit-${suffix}.pptx`);
const snapshots = ['original','revised','incoming'].map(suffix => jsonObject(jsonObject(commit(suffix).tree).semantic.object));
const between = (a,b) => {
  const start = source.indexOf(a), end = source.indexOf(b, start);
  assert.ok(start >= 0 && end > start, a);
  return source.slice(start,end);
};
const single = name => {
  const line = source.split('\n').find(s => s.startsWith(`function ${name}(`));
  assert.ok(line, name);
  return line;
};
function setup() {
  const context = vm.createContext({ console });
  vm.runInContext([single('stableStringify'),single('deepCloneJson'),between('function normalizeDiffText','const COMPARE_CORE_SCHEMA_VERSION'),between('function semEqual','async function commitAncestorDistances')].join('\n'), context);
  // All snapshots are parsed inside the VM to exclude cross-realm identity effects.
  vm.runInContext(`var [base,ours,theirs] = JSON.parse(${JSON.stringify(JSON.stringify(snapshots))});`, context);
  return code => vm.runInContext(code, context);
}

test('exact synthetic fixture has authentic objects and a divergent three-commit topology', () => {
  assert.equal(crypto.createHash('sha256').update(fixtureBytes).digest('hex'), '9bd69d9236d7b044a79791254619adcaad77d4ea39492fd5245c1af4a029605b');
  assert.equal(fixture.commits.length, 3);
  assert.equal(objects.size, 9);
  for (const o of objects.values()) {
    const bytes = Buffer.from(o.data, 'base64');
    assert.equal(bytes.length, o.size);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), o.id);
  }
  assert.deepEqual(commit('revised').parents, [commit('original').id]);
  assert.deepEqual(commit('incoming').parents, [commit('original').id]);
});

test(`${target}: slide adapter maps cloned matches back to both original arrays`, () => {
  const run = setup();
  assert.equal(run(`(()=>{const matched=mapBaseSlides(base,ours);return base.slides.every((s,i)=>matched.map.get(s)===ours.slides[i])})()`), true);
});

test(`${target}: object adapter maps cloned matches back to both original arrays`, () => {
  const run = setup();
  assert.equal(run(`(()=>{const matched=mapBaseToSide(base.slides[0],ours.slides[0]);return base.slides[0].objects.every((o,i)=>matched.map.get(o)===ours.slides[0].objects[i])})()`), true);
});

test(`${target}: unchanged merge retains both slides, four objects and original order`, () => {
  const run = setup();
  const result = JSON.parse(run(`JSON.stringify(threeWayMergeSemantic(base,deepCloneJson(base),deepCloneJson(base)))`));
  assert.equal(result.merged.slideCount, 2);
  assert.equal(result.merged.objectCount, 4);
  assert.deepEqual(result.merged.slides.map(s => s.stableId), snapshots[0].slides.map(s => s.stableId));
  assert.equal(result.conflicts.length, 0);
});

test(`${target}: exact divergent fixture retains anchors, independent edit and explicit text conflict`, () => {
  const run = setup();
  const result = JSON.parse(run(`JSON.stringify(threeWayMergeSemantic(base,ours,theirs))`));
  assert.equal(result.merged.slideCount, 2);
  assert.equal(result.merged.objectCount, 4);
  assert.deepEqual(result.merged.slides.map(s => s.stableId), snapshots[0].slides.map(s => s.stableId));
  assert.equal(result.merged.slides[1].objects[1].text, snapshots[1].slides[1].objects[1].text, 'independent revised checklist survives');
  assert.match(result.merged.slides[1].objects[1].text, /Keep: stable anchor/);
  const conflict = result.conflicts.find(c => c.path.endsWith('/text'));
  assert.ok(conflict, 'current/incoming text changes require an explicit choice');
  assert.equal(conflict.ours, 'Release target: 12 items');
  assert.equal(conflict.theirs, 'Release target: 14 items');
  assert.equal(result.conflicts.length, 1);
});

test(`${target}: independent mixed-slide edits retain every object and both changes`, () => {
  const run = setup();
  const result = JSON.parse(run(`(()=>{ours=deepCloneJson(base);theirs=deepCloneJson(base);ours.slides[0].objects[0].text='Current title';ours.slides[0].objects[0].fingerprint='current-title';ours.slides[0].fingerprint='current-slide';theirs.slides[0].objects[1].text='Incoming body';theirs.slides[0].objects[1].fingerprint='incoming-body';theirs.slides[0].fingerprint='incoming-slide';return JSON.stringify(threeWayMergeSemantic(base,ours,theirs))})()`));
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.merged.objectCount, 4);
  assert.deepEqual(result.merged.slides[0].objects.map(o => o.text), ['Current title','Incoming body']);
});

test(`${target}: unchanged current side accepts incoming changes without dropping slides`, () => {
  const run = setup();
  const result = JSON.parse(run(`JSON.stringify(threeWayMergeSemantic(base,deepCloneJson(base),theirs))`));
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.merged.slideCount, 2);
  assert.equal(result.merged.slides[0].objects[1].text, 'Release target: 14 items');
});

test(`${target}: added slide and object adapters return actual side objects`, () => {
  const run = setup();
  assert.equal(run(`(()=>{const extra=deepCloneJson(ours.slides[0]);extra.stableId='new-slide';extra.fingerprint='new-slide';extra.index=3;ours.slides.push(extra);const slides=mapBaseSlides(base,ours);const extraObject=deepCloneJson(ours.slides[1].objects[0]);extraObject.sourceId='99';extraObject.fingerprint='new-object';ours.slides[1].objects.push(extraObject);const objects=mapBaseToSide(base.slides[1],ours.slides[1]);return slides.adds.length===1&&slides.adds[0]===extra&&objects.adds.length===1&&objects.adds[0]===extraObject})()`), true);
});

test(`${target}: one-sided removal preserves the surviving slide and one-sided reorder preserves order`, () => {
  const run = setup();
  const results = JSON.parse(run(`(()=>{const removed=deepCloneJson(base);removed.slides.pop();const a=threeWayMergeSemantic(base,deepCloneJson(base),removed);const reordered=deepCloneJson(base);reordered.slides.reverse();const b=threeWayMergeSemantic(base,deepCloneJson(base),reordered);return JSON.stringify([a,b])})()`));
  assert.equal(results[0].conflicts.length, 0);
  assert.equal(results[0].merged.slideCount, 1);
  assert.equal(results[0].merged.slides[0].stableId, snapshots[0].slides[0].stableId);
  assert.equal(results[1].conflicts.length, 0);
  assert.deepEqual(results[1].merged.slides.map(s => s.stableId), snapshots[0].slides.map(s => s.stableId).reverse());
});

test(`${target}: merge planning leaves original semantic snapshots untouched`, () => {
  const run = setup();
  assert.equal(run(`(()=>{const before=JSON.stringify([base,ours,theirs]);threeWayMergeSemantic(base,ours,theirs);return JSON.stringify([base,ours,theirs])===before})()`), true);
});

test(`${target}: one-sided slide addition is retained at its intended position`, () => {
  const run = setup();
  const result = JSON.parse(run(`(()=>{ours=deepCloneJson(base);theirs=deepCloneJson(base);const added=deepCloneJson(base.slides[0]);added.stableId='slide-999';added.sourceId='999';added.fingerprint='added-slide';added.title='Added slide';added.objects[0].text='Added slide';added.objects[0].fingerprint='added-title';theirs.slides.splice(1,0,added);return JSON.stringify(threeWayMergeSemantic(base,ours,theirs))})()`));
  assert.equal(result.conflicts.length, 0);
  assert.deepEqual(result.merged.slides.map(s => s.stableId), ['slide-256','slide-999','slide-257']);
  assert.equal(result.merged.objectCount, 6);
});

test(`${target}: incompatible slide orders remain an explicit conflict without losing slides`, () => {
  const run = setup();
  const result = JSON.parse(run(`(()=>{const extra=deepCloneJson(base.slides[0]);extra.stableId='slide-999';extra.fingerprint='third-slide';extra.index=3;base.slides.push(extra);ours=deepCloneJson(base);theirs=deepCloneJson(base);ours.slides=[ours.slides[1],ours.slides[0],ours.slides[2]];theirs.slides=[theirs.slides[0],theirs.slides[2],theirs.slides[1]];return JSON.stringify(threeWayMergeSemantic(base,ours,theirs))})()`));
  assert.equal(result.merged.slideCount, 3);
  assert.equal(new Set(result.merged.slides.map(s => s.stableId)).size, 3);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].kind, 'order');
});
