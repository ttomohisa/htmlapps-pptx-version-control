import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

// Exercise the application's actual async picker and result-summary functions.
// The repository and DOM are replaced with deterministic, fictitious boundaries.
const source = fs.readFileSync(new URL('../src/index.template.html', import.meta.url), 'utf8');
const lines = source.split('\n');
const functionLine = name => {
  const result = lines.find(line => line.startsWith('function ' + name + '(') ||
    line.startsWith('async function ' + name + '('));
  assert.ok(result, name);
  return result;
};
function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}
function makeSelect() {
  let selected = '';
  return {
    options: [],
    get textContent() { return ''; },
    set textContent(_) { this.options = []; selected = ''; },
    append(...children) {
      for (const child of children) {
        this.options.push(child);
        if (!selected) selected = child.value;
      }
    },
    get value() { return selected; },
    set value(value) {
      selected = this.options.some(item => item.value === value) ? value : '';
    }
  };
}
function setup() {
  const el = new Map();
  const $ = query => {
    if (!el.has(query)) {
      if (query.endsWith('Select') || query.endsWith('BranchSelect'))
        el.set(query, makeSelect());
      else el.set(query, { hidden: false, disabled: false, textContent: '' });
    }
    return el.get(query);
  };
  const histories = {
    'refs/heads/main': [
      { id: 'main-b', createdAt: '2026-01-02', sourceFileName: 'main-b.pptx' },
      { id: 'main-a', createdAt: '2026-01-01', sourceFileName: 'main-a.pptx' }
    ],
    'refs/heads/topic': [
      { id: 'topic-b', createdAt: '2026-01-04', sourceFileName: 'topic-b.pptx' },
      { id: 'topic-a', createdAt: '2026-01-03', sourceFileName: 'topic-a.pptx' }
    ]
  };
  const calls = [];
  let gate = null, working = false;
  const state = {
    project: { id: 'p' },
    branches: [{ name: 'refs/heads/main' }, { name: 'refs/heads/topic' }],
    currentBranchRef: 'refs/heads/main',
    compareFromBranchRef: 'refs/heads/main',
    compareToBranchRef: 'refs/heads/topic',
    compareFromId: 'main-a',
    compareToId: 'topic-b',
    compareControlEpoch: 0,
    diffLoading: false
  };
  const c = {
    $, state,
    document: { createElement: () => ({ value: '', textContent: '' }) },
    branchShortName: ref => ref.split('/').at(-1),
    commitDisplayName: commit => commit.id,
    formatDate: d => d,
    t: x => x,
    currentWorkingComparable: () => working,
    loadProjectHistory: async (_, ref) => {
      if (gate) await gate.promise;
      return histories[ref] || [];
    },
    showCompareDiff: async (from, to, options) => { calls.push({ from, to, ...options }); }
  };
  vm.createContext(c);
  vm.runInContext(['compareVersionLabel', 'compareHistoryForBranch',
    'populateCompareVersionSelect', 'renderCompareControls',
    'swapCompareSides', 'updateCompareButtonState'].map(functionLine).join('\n'), c);
  return { c, $, calls, state, setGate: x => { gate = x; }, setWorking: v => { working = v; } };
}

test('swap waits for branch history and compares the reversed exact versions', async () => {
  const { c, $, calls, state, setGate } = setup();
  await c.renderCompareControls();
  assert.equal($('#compareFromSelect').value, 'main-a');
  assert.equal($('#compareToSelect').value, 'topic-b');
  const gate = deferred();
  setGate(gate);
  const request = c.swapCompareSides();
  await Promise.resolve();
  assert.equal(calls.length, 0, 'must not compare before asynchronous options finish');
  gate.resolve();
  await request;
  assert.equal($('#compareFromBranchSelect').value, 'refs/heads/topic');
  assert.equal($('#compareToBranchSelect').value, 'refs/heads/main');
  assert.equal($('#compareFromSelect').value, 'topic-b');
  assert.equal($('#compareToSelect').value, 'main-a');
  assert.deepEqual(calls.map(call => ({ ...call })), [{
    from: 'topic-b', to: 'main-a',
    fromBranchRef: 'refs/heads/topic', toBranchRef: 'refs/heads/main'
  }]);
  assert.equal(state.compareFromId, 'topic-b');
  assert.equal(state.compareToId, 'main-a');
  setGate(null);
  await c.swapCompareSides();
  assert.equal(calls[1].from, 'main-a');
  assert.equal(calls[1].to, 'topic-b');
});

test('swap preserves unsaved-working comparison choice across sides', async () => {
  const { c, $, calls, state, setWorking } = setup();
  setWorking(true);
  state.compareFromBranchRef = 'refs/heads/topic';
  state.compareFromId = 'topic-a';
  state.compareToBranchRef = 'refs/heads/main';
  state.compareToId = '__working__';
  await c.renderCompareControls();
  await c.swapCompareSides();
  assert.equal($('#compareFromSelect').value, '__working__');
  assert.equal($('#compareToSelect').value, 'topic-a');
  assert.equal(calls[0].from, '__working__');
  assert.equal(calls[0].to, 'topic-a');
});

test('a later picker refresh cancels stale swap comparison', async () => {
  const { c, calls, state, setGate } = setup();
  await c.renderCompareControls();
  const gate = deferred();
  setGate(gate);
  const pending = c.swapCompareSides();
  state.compareControlEpoch++;
  gate.resolve();
  await pending;
  assert.equal(calls.length, 0);
});

function makeSummaryContext() {
  const elements = new Map();
  class Element {
    constructor() { this.children = []; this._text = ''; this.hidden = false; }
    get textContent() { return this._text; }
    set textContent(value) { this._text = value; this.children = []; }
    append(...children) { this.children.push(...children); }
  }
  const $ = query => {
    if (!elements.has(query)) elements.set(query, new Element());
    return elements.get(query);
  };
  const c = { $, document: { createElement: () => new Element() }, t: key => key };
  vm.createContext(c);
  vm.runInContext(functionLine('renderCompactCompareSummary'), c);
  return { c, $ };
}
test('comparison overview only exposes the three essential slide counts', () => {
  const { c, $ } = makeSummaryContext();
  c.renderCompactCompareSummary({ changedSlides: 3, addedSlides: 1, removedSlides: 0,
    movedSlides: 0, text: 2, number: 2, object: 0, image: 0, layout: 0, formatting: 0, notes: 0 });
  assert.equal($('#diffSummary').children.length, 3);
  assert.deepEqual($('#diffSummary').children.map(e => e.children[0].textContent), ['3','1','0']);
  assert.equal($('#diffBreakdown').hidden, false);
  assert.equal($('#diffBreakdownGrid').children.length, 7, 'all detailed categories remain accessible');
  assert.equal($('#diffBreakdownPreview').textContent, 'diffText 2 · diffNumber 2');
  c.renderCompactCompareSummary({ changedSlides: 1, addedSlides: 0, removedSlides: 0,
    movedSlides: 1, text: 0, number: 0, image: 0, object: 0, layout: 0, formatting: 0, notes: 0 });
  assert.equal($('#diffSummary').children.length, 4, 'slide movement is highlighted when present');
  assert.equal($('#diffBreakdown').hidden, true, 'empty detail categories are not shown');
});
