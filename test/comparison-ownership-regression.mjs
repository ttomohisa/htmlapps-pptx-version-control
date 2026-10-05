import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

// Actual final application declarations; fictitious repository, parser and DOM
// boundaries only. This is not browser, IndexedDB or PPTX rendering coverage.
const source = fs.readFileSync(process.env.COMPARISON_SOURCE || new URL('../src/index.template.html', import.meta.url), 'utf8');
const lines = source.split('\n');
const fn = name => {
  const matches = lines.filter(x => x.startsWith(`function ${name}(`) || x.startsWith(`async function ${name}(`));
  assert.ok(matches.length, `actual function ${name} exists`);
  return matches.at(-1);
};
function deferred() { let resolve, reject; const promise = new Promise((r,j) => {resolve=r;reject=j;}); return {promise,resolve,reject}; }
const tick = () => new Promise(setImmediate);
function element(tag = 'div') {
  return { tag, value:'', disabled:false, open:false, dataset:{}, children:[], listeners:{}, className:'',
    set textContent(value) { this.text=value; this.children=[]; }, get textContent(){return this.text||'';},
    append(...children){this.children.push(...children);}, close(){this.open=false;},
    addEventListener(type,fn){this.listeners[type]=fn;}, setAttribute(name,value){this[name]=value;} };
}
function setup() {
  const commits = Object.fromEntries(['a','b','c'].map((id,i)=>[id,{id,projectId:'p',parents:i?[['a','b'][i-1]]:[],tree:`tree-${id}`,message:`Version ${id}`,sourceFileName:`${id}.pptx`,fingerprint:`fp-${id}`} ]));
  const elements = new Map(), events=[], toasts=[], writes=[], errors=[];
  const $ = id => { if(!elements.has(id)) elements.set(id,element()); return elements.get(id); };
  const c = { console:{error:e=>errors.push(e)}, $, state:{}, File: class {constructor(parts,name){this.parts=parts;this.name=name;}},
    repoGet:async(store,id)=>store==='projects'?{id,name:'Project'}:store==='objects'?{data:'fictitious bytes'}:commits[id],
    treeForCommit:async commit=>({package:{filename:commit.sourceFileName},semantic:{fingerprint:commit.fingerprint}}),
    packageForCommit:async commit=>({tree:{package:{filename:commit.sourceFileName}},obj:{data:'fictitious bytes'}}),
    getJsonObject:async()=>({package:{object:'package-c',filename:'c.pptx'}}),
    getHeadRef:async()=>({name:'refs/heads/main',commitId:'c'}),
    getBranchRef:async(projectId,name)=>({name,commitId:'c'}),
    refreshBranchState:async()=>{},loadProjectHistory:async()=>[commits.c,commits.b,commits.a],computeProjectStats:async()=>({}),
    commitDisplayName:x=>x.label||x.message,formatDate:x=>x,shortHash:x=>x,
    currentFileState:()=> 'changed',
    buildComparisonSession:async(from,to,{mode})=>({id:`${from.id}:${to.id}`,from,to,mode,result:{rows:[]},slidePairs:[]}),
    clearRendererPairHandles(){events.push('clearRenderer');}, stopVisualBlink(){events.push('stopBlink');},
    renderHistory(){events.push('history');},renderCompareControls(){events.push('controls');},renderDiff(){events.push('diff');},
    activateTab(tab){events.push(`activate:${tab}`);c.state.activeTab=tab;},
    renderRepositoryPanel(){},renderBranchPicker(){},renderBranches(){},resetMergeResolverState(){},refreshLocalProjects:async()=>{},
    renderCheckoutBanner(){},renderProject(){},setStatus(){},updateProgress(){},
    parsePresentation:async file=>({filename:file.name,sourceSha256:'new-sha',fingerprint:'new-fp',_zip:{synthetic:true}}),
    showState:phase=>{c.state.phase=phase;},safeBase:x=>x,errorText:e=>e.message,fmt:x=>x,t:x=>x,
    repoDelete:async(...x)=>{writes.push(x);},repoPut:async(...x)=>{writes.push(x);},repoWrite:async(...x)=>{writes.push(x);},
    document:{createElement:element},AppToast:{show:x=>toasts.push(x)}
  };
  vm.createContext(c);
  vm.runInContext(lines.find(x=>x.startsWith('const state=')).replace('const state=','state='),c);
  const names=['comparisonEmptyInput','comparisonInputFromCommit','comparisonInputFromWorking','currentWorkingComparable',
    'compareInputFromUi','comparisonSessionLegacy','applyComparisonSession','showCompareDiff','showCommitDiff','showWorkingVisualCompare','buildHeadWorkingComparisonSession',
    'updateCompareButtonState','invalidateVersionDialog','closeVersionDialog','invalidateVersionContext','startNewProject','loadFile','openProject','loadStoredCommit','switchBranch','confirmBranchDialog','branchRefName','validBranchName'];
  // The new helpers may be absent during RED, so existing paths still exercise
  // the baseline defect instead of all failing on a harness import error.
  for(const name of ['beginComparisonRequest','comparisonRequestIsCurrent','finishComparisonRequest','showHistoryCompareLatest']) {
    if(lines.some(x=>x.startsWith(`function ${name}(`)||x.startsWith(`async function ${name}(`))) names.push(name);
  }
  vm.runInContext(names.map(fn).join('\n'),c);
  Object.assign(c.state,{project:{id:'p'},history:[commits.c,commits.b,commits.a],currentBranchRef:'refs/heads/main',
    compareFromBranchRef:'refs/heads/main',compareToBranchRef:'refs/heads/main',file:{name:'working.pptx'},model:{filename:'working.pptx',sourceSha256:'working-sha',fingerprint:'working-fp'}});
  $('#compareFromSelect').value='a';$('#compareToSelect').value='c';
  return {c,events,toasts,writes,commits,$,errors};
}
const starts = {
  custom:c=>c.showCompareDiff('a','c'), parent:c=>c.showCommitDiff('c'), working:c=>c.showWorkingVisualCompare()
};
const boundaries = {
  reset:c=>c.startNewProject(), replacement:c=>c.loadFile({name:'replacement.pptx'}),
  reopen:c=>c.openProject('p'), stored:c=>c.loadStoredCommit('a',{toast:false}), branch:c=>c.switchBranch('refs/heads/topic')
};
function assertNoLateUi(events,before) { assert.deepEqual(events.slice(before).filter(x=>['history','controls','diff','activate:diff'].includes(x)),[]); }

for(const [kind,start] of Object.entries(starts)) {
  test(`${kind}: normal comparison is read-only and keeps branch, working source and history`,async()=>{
    const {c,writes}=setup(),file=c.state.file,model=c.state.model,history=JSON.stringify(c.state.history);
    await start(c);assert.ok(c.state.compareSession);assert.equal(c.state.currentBranchRef,'refs/heads/main');
    assert.equal(c.state.file,file);assert.equal(c.state.model,model);assert.equal(JSON.stringify(c.state.history),history);assert.equal(writes.length,0);assert.equal(c.state.diffLoading,false);
  });
  for(const [boundary,transition] of Object.entries(boundaries)) {
    for(const outcome of ['resolve','reject']) {
      test(`${kind}: ${boundary} suppresses late session/error/finalizer (${outcome})`,async()=>{
        const {c,events,toasts}=setup(),pending=deferred(),build=c.buildComparisonSession;
        c.buildComparisonSession=async(...args)=>{await pending.promise;return build(...args);};
        const old=start(c);await tick();await transition(c);const before=events.length,toastCount=toasts.length;
        if(outcome==='resolve')pending.resolve();else pending.reject(Error('abandoned failure'));
        await old;assertNoLateUi(events,before);assert.equal(toasts.length,toastCount);assert.equal(c.state.diffLoading,false);
      });
    }
  }
  test(`${kind}: early storage completion after reset never builds a session`,async()=>{
    const {c,commits}=setup(),pending=deferred(),get=c.repoGet;let builds=0;
    c.repoGet=async(store,id)=>store==='commits'?pending.promise:get(store,id);
    c.buildComparisonSession=async()=>{builds++;return {slidePairs:[],result:{rows:[]}};};
    const old=start(c);await tick();c.startNewProject();pending.resolve(commits.c);await old;
    assert.equal(builds,0);assert.equal(c.state.compareSession,null);
  });
  test(`${kind}: repeated triggers build once while current error releases retry`,async()=>{
    const {c,toasts}=setup(),pending=deferred(),build=c.buildComparisonSession;let builds=0;
    c.buildComparisonSession=async(...args)=>{builds++;await pending.promise;return build(...args);};
    const first=start(c);await tick();const second=start(c);await tick();assert.equal(builds,1);
    pending.reject(Error('current failure'));await Promise.all([first,second]);assert.equal(toasts.length,1);assert.equal(c.state.diffLoading,false);
    c.buildComparisonSession=build;await start(c);assert.ok(c.state.compareSession);
  });
}

test('a stale finalizer cannot release a newer pending comparison or alter its button',async()=>{
  const {c,$}=setup(),oldGate=deferred(),newGate=deferred(),build=c.buildComparisonSession;let count=0;
  c.buildComparisonSession=async(...args)=>{const gate=++count===1?oldGate:newGate;await gate.promise;return build(...args);};
  const old=c.showCompareDiff('a','c');await tick();c.startNewProject();
  Object.assign(c.state,{project:{id:'p'},file:{name:'new.pptx'},model:{filename:'new.pptx'}});
  const next=c.showCompareDiff('b','c');await tick();assert.equal(count,2);
  oldGate.resolve();await old;assert.equal(c.state.diffLoading,true);assert.equal($('#compareVersionsButton').disabled,true);assert.equal(c.state.compareSession,null);
  newGate.resolve();await next;assert.equal(c.state.compareSession.from.commitId,'b');assert.equal(c.state.diffLoading,false);
});
test('newer comparison remains installed after an abandoned comparison completes',async()=>{
  const {c}=setup(),pending=deferred(),build=c.buildComparisonSession;let count=0;
  c.buildComparisonSession=async(...args)=>{if(++count===1)await pending.promise;return build(...args);};
  const old=c.showCompareDiff('a','c');await tick();await c.loadFile({name:'new.pptx'});await c.showCompareDiff('b','c');
  const current=c.state.compareSession;pending.resolve();await old;assert.equal(c.state.compareSession,current);
});
test('parent comparison keeps empty initial and parent direction',async()=>{
  const {c}=setup();await c.showCommitDiff('a');assert.equal(c.state.compareSession.from.kind,'empty');assert.equal(c.state.compareSession.to.commitId,'a');
  await c.showCommitDiff('c');assert.equal(c.state.compareSession.from.commitId,'b');assert.equal(c.state.compareSession.mode,'parent');
});
test('custom reversed and cross-branch pairs preserve explicit inputs',async()=>{
  const {c}=setup();c.state.compareFromBranchRef='refs/heads/topic';await c.showCompareDiff('c','a');
  assert.equal(c.state.compareSession.from.commitId,'c');assert.equal(c.state.compareSession.to.commitId,'a');assert.equal(c.state.compareSession.from.branchRef,'refs/heads/topic');assert.equal(c.state.compareSession.mode,'branch');
});
test('working comparison snapshots saved HEAD, file, model and branch before storage await',async()=>{
  const {c,commits}=setup(),gate=deferred(),get=c.repoGet,file=c.state.file,model=c.state.model;
  c.repoGet=async(store,id)=>id==='c'?gate.promise:get(store,id);
  const run=c.showWorkingVisualCompare();await tick();c.state.history=[commits.b,commits.a];
  gate.resolve(commits.c);await run;assert.equal(c.state.compareSession.from.commitId,'c');assert.equal(c.state.compareSession.to._file,file);assert.equal(c.state.compareSession.to._model,model);
  assert.equal(c.state.compareSession.from.branchRef,'refs/heads/main');assert.equal(c.state.compareSession.to.branchRef,'refs/heads/main');
});
test('invalid and empty file selection preserve a current comparison request',async()=>{
  const {c}=setup(),gate=deferred(),build=c.buildComparisonSession;
  c.buildComparisonSession=async(...args)=>{await gate.promise;return build(...args);};
  const run=c.showCompareDiff('a','c');await tick();await c.loadFile(undefined);await c.loadFile({name:'invalid.txt'});gate.resolve();await run;
  assert.equal(c.state.compareSession.from.commitId,'a');
});
test('identical custom pair is rejected without work',async()=>{
  const {c,toasts}=setup();let builds=0;c.buildComparisonSession=async()=>{builds++;};await c.showCompareDiff('a','a');
  assert.equal(builds,0);assert.equal(toasts[0].message,'compareSameVersion');
});
test('Compare button remains disabled while its request is loading',async()=>{
  const {c,$}=setup(),gate=deferred(),build=c.buildComparisonSession;
  c.buildComparisonSession=async(...args)=>{await gate.promise;return build(...args);};
  const run=c.showCompareDiff('a','c');await tick();c.updateCompareButtonState();assert.equal($('#compareVersionsButton').disabled,true);gate.resolve();await run;assert.equal($('#compareVersionsButton').disabled,false);
});
for(const id of ['a','b']) {
  test(`History ${id} shortcut captures active saved HEAD and overrides previous cross-branch pickers`,async()=>{
    const {c,commits,writes}=setup();assert.equal(typeof c.showHistoryCompareLatest,'function');
    c.state.compareFromBranchRef='refs/heads/old';c.state.compareToBranchRef='refs/heads/other';c.state.checkoutCommitId='a';
    const gate=deferred(),get=c.repoGet,file=c.state.file;
    c.repoGet=async(store,key)=>key==='c'?gate.promise:get(store,key);
    const run=c.showHistoryCompareLatest(id);await tick();c.state.history=[{...commits.c,id:'new-head'},commits.c,commits.b,commits.a];
    gate.resolve(commits.c);await run;const session=c.state.compareSession;
    assert.equal(session.from.commitId,id);assert.equal(session.to.commitId,'c');assert.equal(session.from.branchRef,'refs/heads/main');assert.equal(session.to.branchRef,'refs/heads/main');
    assert.equal(c.state.checkoutCommitId,'a');assert.equal(c.state.file,file);assert.equal(c.state.history[0].id,'new-head');assert.equal(writes.length,0);
  });
}
test('shortcut rejects absent, foreign, HEAD and empty/single-version history rows without building',async()=>{
  const {c,commits}=setup();assert.equal(typeof c.showHistoryCompareLatest,'function');let builds=0;c.buildComparisonSession=async()=>{builds++;};
  await c.showHistoryCompareLatest('missing');await c.showHistoryCompareLatest('c');
  c.state.history=[commits.c,{...commits.a,projectId:'foreign'}];await c.showHistoryCompareLatest('a');
  c.state.history=[commits.a];await c.showHistoryCompareLatest('a');c.state.history=[];await c.showHistoryCompareLatest('a');assert.equal(builds,0);
});
test('History renders native older-row shortcut buttons and binds the click without changing parent diff',()=>{
  const {c,$}=setup();vm.runInContext(fn('renderHistory'),c);c.renderHistory();
  const rows=$('#historyList').children,actions=rows.map(row=>row.children.at(-1).children);
  assert.equal(actions[0].filter(x=>x.dataset.compareLatest).length,0);
  for(const [i,id] of [[1,'b'],[2,'a']]){const button=actions[i].find(x=>x.dataset.compareLatest===id);assert.ok(button);assert.equal(button.tag,'button');assert.equal(button.type,'button');assert.equal(button.textContent,'compareWithLatest');assert.ok(actions[i].some(x=>x.dataset.viewDiff===id));}
  const bindingStart=source.indexOf("$('#historyList').addEventListener"),bindingEnd=source.indexOf("$('#slidesTab').addEventListener",bindingStart);assert.ok(bindingStart>=0&&bindingEnd>bindingStart);vm.runInContext(source.slice(bindingStart,bindingEnd),c);
  let clicked;c.showHistoryCompareLatest=id=>{clicked=id;};$('#historyList').listeners.click({target:{closest:selector=>selector==='[data-compare-latest]'?{dataset:{compareLatest:'a'}}:null}});assert.equal(clicked,'a');
});

for(const mode of ['create','rename']) {
  test(`accepted branch ${mode} invalidates a pending comparison before storage completes`,async()=>{
    const {c,$,events}=setup(),compareGate=deferred(),branchGate=deferred(),build=c.buildComparisonSession;
    c.buildComparisonSession=async(...args)=>{await compareGate.promise;return build(...args);};
    const compare=c.showCompareDiff('a','c');await tick();
    c.state.branchDialogMode=mode;c.state.branchTargetRef='refs/heads/main';
    $('#branchNameInput').value='renamed';$('#branchBaseSelect').value='c';
    if(mode==='rename')c.getBranchRef=()=>branchGate.promise;else c.repoWrite=()=>branchGate.promise;
    const changing=c.confirmBranchDialog();await tick();const before=events.length;
    compareGate.resolve();await compare;assert.equal(c.state.compareSession,null);assertNoLateUi(events,before);
    branchGate.resolve({name:'refs/heads/main',commitId:'c'});await changing;
  });
}

test('History shortcut ignores clicks while source or branch transition is busy',async()=>{
  const {c}=setup();c.state.busy=true;let builds=0;c.buildComparisonSession=async()=>{builds++;return {slidePairs:[],result:{rows:[]}};};
  await c.showHistoryCompareLatest('a');assert.equal(builds,0);assert.equal(c.state.compareSession,null);
});

test('same-owner comparison releases loading when an in-progress branch change makes its context stale',async()=>{
  const {c,$}=setup(),gate=deferred(),branchRead=deferred(),branchList=deferred(),build=c.buildComparisonSession;
  c.buildComparisonSession=async(...args)=>{await gate.promise;return build(...args);};
  // Run the real midway ref-before-branches/history refresh. The branch action
  // passed its initial invalidation, then a comparison began during its read.
  vm.runInContext([fn('refreshBranchState'),fn('branchShortName')].join('\n'),c);
  c.getActiveBranchRefName=async()=> 'refs/heads/renamed';c.loadBranches=()=>branchList.promise;c.getBranchRef=()=>branchRead.promise;
  c.state.branchDialogMode='rename';c.state.branchTargetRef='refs/heads/main';$('#branchNameInput').value='renamed';
  const changing=c.confirmBranchDialog();await tick();
  const run=c.showCompareDiff('a','c');await tick();branchRead.resolve({name:'refs/heads/main',commitId:'c'});await tick();
  assert.equal(c.state.currentBranchRef,'refs/heads/renamed');
  gate.resolve();await run;assert.equal(c.state.compareSession,null);assert.equal(c.state.diffLoading,false);assert.equal(c.state.comparisonRequest,null);assert.equal($('#compareVersionsButton').disabled,false);
  branchList.resolve([{name:'refs/heads/renamed',commitId:'c'}]);await changing;
  await c.showCompareDiff('b','c');assert.equal(c.state.compareSession.from.commitId,'b');
});
