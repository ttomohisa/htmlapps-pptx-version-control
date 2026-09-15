import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/index.template.html', import.meta.url), 'utf8');
function sliceBetween(a,b){const s=source.indexOf(a),e=source.indexOf(b,s);if(s<0||e<0)throw new Error(`slice missing: ${a}`);return source.slice(s,e)}

const commits={
  cMain:{id:'cMain',message:'main head',sourceFileName:'main.pptx',sourceSha256:'sha-main',fingerprint:'fp-main'},
  cCustomer:{id:'cCustomer',message:'customer head',sourceFileName:'customer.pptx',sourceSha256:'sha-customer',fingerprint:'fp-customer'}
};
const refs={
  'p1:refs/heads/main':{id:'p1:refs/heads/main',projectId:'p1',name:'refs/heads/main',commitId:'cMain'},
  'p1:refs/heads/customer-a':{id:'p1:refs/heads/customer-a',projectId:'p1',name:'refs/heads/customer-a',commitId:'cCustomer'}
};
const calls=[];
const context={
  console,
  state:{project:{id:'p1'},model:{filename:'edited.pptx'},file:{name:'edited.pptx'},currentBranchRef:'refs/heads/main'},
  repoGet:async(store,id)=>store==='refs'?refs[id]:commits[id],
  comparisonInputFromCommit:async(commitOrId,{branchRef=''}={})=>{const c=typeof commitOrId==='string'?commits[commitOrId]:commitOrId;return{kind:'commit',commitId:c.id,branchRef,filename:c.sourceFileName}},
  comparisonInputFromWorking:({model,file,label})=>({kind:'working',filename:model.filename||file.name,label}),
  buildComparisonSession:async(from,to,{mode}={})=>{calls.push({from,to,mode});return{from,to,mode,slidePairs:[]}},
  getHeadRef:async()=>refs['p1:refs/heads/main'],
  safeBase:v=>String(v||'').replace(/\.pptx$/i,'')
};
vm.createContext(context);
vm.runInContext(sliceBetween('async function comparisonInputFromBranch','const CompareCore='),context);

const branchSession=await context.buildBranchComparisonSession('p1','refs/heads/main','refs/heads/customer-a');
if(branchSession.mode!=='branch')throw new Error('branch session mode');
if(branchSession.from.commitId!=='cMain'||branchSession.to.commitId!=='cCustomer')throw new Error('branch heads not resolved');
if(context.state.currentBranchRef!=='refs/heads/main')throw new Error('branch comparison mutated active branch');
const workingSession=await context.buildHeadWorkingComparisonSession();
if(workingSession.mode!=='working'||workingSession.from.commitId!=='cMain'||workingSession.to.kind!=='working')throw new Error('HEAD vs working session failed');
console.log('ok: branch-to-branch and HEAD-to-working comparison inputs');

const planContext={console};
vm.createContext(planContext);
vm.runInContext(sliceBetween('function visualWindowIndexes','function resetVisualContainer'),planContext);
const pairs=[
  {pairKey:'p0',status:'unchanged',original:{index:1,stableId:'s1'},revised:{index:1,stableId:'s1'}},
  {pairKey:'p1',status:'removed',original:{index:2,stableId:'s2'},revised:null},
  {pairKey:'p2',status:'added',original:null,revised:{index:2,stableId:'s3'}},
  {pairKey:'p3',status:'changed',original:{index:3,stableId:'s4'},revised:{index:3,stableId:'s4'}},
  {pairKey:'p4',status:'changed',original:{index:4,stableId:'s5'},revised:{index:4,stableId:'s5'}}
];
const plan=planContext.visualRenderPlan({id:'session',slidePairs:pairs},2,{radius:1});
if(plan.indexes.join(',')!=='1,2,3')throw new Error(`lazy window wrong: ${plan.indexes}`);
if(plan.pairs[0].from.available!==true||plan.pairs[0].to.available!==false)throw new Error('removed-side availability wrong');
if(plan.pairs[1].from.available!==false||plan.pairs[1].to.available!==true)throw new Error('added-side availability wrong');
if(!plan.pairs[1].selected)throw new Error('selected pair missing');
console.log('ok: lazy three-slide render window and Added/Removed side states');

for(const needle of [
  'if(epoch!==state.visualRenderEpoch)return{status:\'stale\'',
  "visualFallback(container,'missing','')",
  'state.rendererPairHandles.set(pairKey',
  'for(const key of [...state.rendererPairHandles.keys()])if(!keep.has(key))releaseRendererPair(key)',
  'function clearRendererPairHandles()',
  'function activeRendererPreparedKeys()',
  'preparedKeys:[prepared.from?.key',
  'buildBranchSession:buildBranchComparisonSession',
  'buildHeadWorkingSession:buildHeadWorkingComparisonSession'
])if(!source.includes(needle))throw new Error(`hardening marker missing: ${needle}`);
console.log('ok: stale guards, pair cleanup, and hardening API markers');
