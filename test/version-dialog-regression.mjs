import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Blob } from 'node:buffer';

// Exercise the actual application functions with tiny fictitious repository/DOM
// boundary doubles. No browser, file picker, or PPTX parser is used.
const source = fs.readFileSync(process.env.VERSION_DIALOG_SOURCE || new URL('../src/index.template.html', import.meta.url), 'utf8');
const fn = name => {
  const line = source.split('\n').find(x => x.startsWith(`function ${name}(`) || x.startsWith(`async function ${name}(`));
  assert.ok(line, name);
  return line;
};
function deferred() {
  let resolve, reject;
  const promise = new Promise((r, j) => { resolve = r; reject = j; });
  return { promise, resolve, reject };
}
function setup() {
  const commits = {
    a: { id: 'a', projectId: 'p', message: 'Alpha', label: 'Alpha label', sourceFileName: 'alpha.pptx', createdAt: '2026-01-01', fingerprint: 'alpha' },
    b: { id: 'b', projectId: 'p', message: 'Beta', label: 'Beta label', sourceFileName: 'beta.pptx', createdAt: '2026-01-02', fingerprint: 'beta' }
  };
  const blobs = { a: new Blob(['fictitious alpha bytes']), b: new Blob(['fictitious beta bytes']) };
  const elements = new Map();
  const $ = id => {
    if (!elements.has(id)) elements.set(id, { listeners: {}, addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }, dispatch(type, event = {}) { for (const fn of this.listeners[type] || []) fn(event); }, getBoundingClientRect() { return { left: 0, top: 0, right: 100, bottom: 100 }; }, value: '', textContent: '', disabled: false, open: false, children: [], append(...x) { this.children.push(...x); }, showModal() { this.open = true; }, close() { this.open = false; } });
    return elements.get(id);
  };
  const writes = [], saves = [], toasts = [], renders = [], errors = [];
  const stateLine = source.split('\n').find(x => x.startsWith('const state='));
  const context = {
    console: { error: e => errors.push(e) }, Blob, $, state: {},
    repoGet: async (_store, id) => commits[id],
    packageForCommit: async commit => ({ tree: { package: { filename: commit.sourceFileName } }, obj: { data: blobs[commit.id], size: blobs[commit.id].size } }),
    repoPut: async (store, value) => { writes.push({ store, value }); commits[value.id] = value; },
    commitDisplayName: c => c.label || c.message,
    versionNumberForCommit: id => id === 'a' ? '1' : '2',
    formatDate: x => x, formatBytes: x => String(x), t: x => x,
    renderHistory() { renders.push('history'); }, renderDiff() { renders.push('diff'); }, renderRepositoryPanel() {}, renderCheckoutBanner() {},
    renderBranchPicker() {}, renderBranches() {}, stopVisualBlink() {}, resetMergeResolverState() {}, refreshLocalProjects: async () => {},
    openBranchDialog() {}, loadStoredCommit() {}, exportGitFriendly() {}, showCommitDiff() {},
    confirmBranchDialog() {}, confirmDeleteBranch() {}, confirmDeleteProject() {}, createRevertVersion() {},
    renderProject() {}, clearRendererPairHandles() {}, setStatus() {}, updateProgress() {},
    activateTab() {}, fmt: x => x, errorText: e => e.message,
    showState: phase => { context.state.phase = phase; },
    parsePresentation: async file => ({ filename: file.name, sourceSha256: 'gamma', fingerprint: 'gamma', _zip: { id: 'gamma-package' } }),
    safeBase: x => String(x).replace(/\.pptx$/i, ''),
    saveBlob: (blob, filename) => saves.push({ blob, filename }),
    AppToast: { show: x => toasts.push(x) },
    document: { createElement: tag => ({ tag, textContent: '' }) }
  };
  vm.createContext(context);
  vm.runInContext(stateLine.replace('const state=', 'state='), context);
  Object.assign(context.state, { project: { id: 'p' }, history: [commits.b, commits.a] });
  vm.runInContext(source.split('\n').filter(x => /^(?:async )?function (?:invalidateVersionDialog|closeVersionDialog|versionDialogIsCurrent|invalidateVersionContext)\(/.test(x)).join('\n'), context);
  vm.runInContext(['openProject', 'switchBranch', 'loadStoredCommit', 'startNewProject', 'openVersionDialog', 'saveVersionLabel', 'downloadCommitPptx', 'requestRevert', 'loadFile'].map(fn).join('\n'), context);
  vm.runInContext(source.split('\n').find(x => x.startsWith("const versionDialog=$('#versionDialog')")), context);
  return { c: context, $, commits, blobs, writes, saves, toasts, renders, errors };
}

test('control: ordinary details and historical export retain selected version', async () => {
  const { c, $, blobs, writes, saves } = setup();
  await c.openVersionDialog('a');
  assert.equal(c.state.detailCommitId, 'a');
  assert.equal($('#versionDialogTitle').textContent, 'Alpha label');
  await c.downloadCommitPptx('a');
  assert.equal(saves[0].blob, blobs.a);
  assert.equal(saves[0].filename, 'alpha-v1.pptx');
  assert.equal(writes.length, 0);
});

test('control: revert request and Cancel leave history unwritten', () => {
  const { c, $, writes } = setup();
  c.requestRevert('a');
  assert.equal($('#revertDialog').open, true);
  // The actual bound Cancel handler is exactly revertDialog.close().
  assert.ok(source.includes("$('#cancelRevertButton').addEventListener('click',()=>revertDialog.close())"));
  $('#revertDialog').close();
  assert.equal($('#revertDialog').open, false);
  assert.equal(writes.length, 0);
});

test('control: empty file selection preserves loaded version and history', async () => {
  const { c, writes } = setup();
  const original = { filename: 'alpha.pptx', fingerprint: 'alpha' };
  c.state.model = original;
  await c.loadFile(undefined);
  assert.equal(c.state.model, original);
  assert.equal(c.state.history[0].id, 'b');
  assert.equal(writes.length, 0);
});

test('control: replacement loads a fresh working model without changing saved history', async () => {
  const { c, writes } = setup();
  c.state.checkoutCommitId = 'a';
  await c.loadFile({ name: 'gamma.pptx', size: 1 });
  assert.equal(c.state.model.filename, 'gamma.pptx');
  assert.equal(c.state.zip.id, 'gamma-package');
  assert.equal(c.state.checkoutCommitId, '');
  assert.equal(c.state.history[0].id, 'b');
  assert.equal(c.state.phase, 'project');
  assert.equal(c.state.busy, false);
  assert.equal(writes.length, 0);
});

test('latest detail selection must win when earlier package read completes last', async () => {
  const { c, $ } = setup();
  const old = deferred(), original = c.packageForCommit;
  c.packageForCommit = async commit => commit.id === 'a' ? old.promise : original(commit);
  const first = c.openVersionDialog('a');
  await new Promise(setImmediate);
  await c.openVersionDialog('b');
  assert.equal(c.state.detailCommitId, 'b');
  old.resolve(await original({ id: 'a', sourceFileName: 'alpha.pptx' }));
  await first;
  assert.equal(c.state.detailCommitId, 'b', 'stale Alpha detail replaced newer Beta selection');
  assert.equal($('#versionDialogTitle').textContent, 'Beta label');
});

test('closing newest details must not allow earlier pending read to reopen dialog', async () => {
  const { c, $ } = setup();
  const old = deferred(), original = c.packageForCommit;
  c.packageForCommit = async commit => commit.id === 'a' ? old.promise : original(commit);
  const first = c.openVersionDialog('a');
  await new Promise(setImmediate);
  await c.openVersionDialog('b');
  $('#closeVersionDialogButton').dispatch('click');
  old.resolve(await original({ id: 'a', sourceFileName: 'alpha.pptx' }));
  await first;
  assert.equal($('#versionDialog').open, false, 'stale Alpha detail reopened dismissed dialog');
});

test('label save must capture Alpha label before await and preserve newer Beta dialog', async () => {
  const { c, $, commits, writes } = setup();
  await c.openVersionDialog('a');
  $('#versionLabelInput').value = 'Alpha revised';
  const pendingRead = deferred(), original = c.repoGet;
  c.repoGet = async (store, id) => id === 'a' ? pendingRead.promise : original(store, id);
  const saving = c.saveVersionLabel();
  $('#closeVersionDialogButton').dispatch('click');
  await c.openVersionDialog('b');
  assert.equal($('#versionLabelInput').value, 'Beta label');
  pendingRead.resolve(commits.a);
  await saving;
  assert.equal(writes[0].value.label, 'Alpha revised', 'Alpha commit received Beta dialog label');
  assert.equal($('#versionDialogTitle').textContent, 'Beta label');
});

test('latest selection also wins across the first commit read', async () => {
  const { c, $, commits } = setup();
  const pending = deferred(), original = c.repoGet;
  c.repoGet = (store, id) => id === 'a' ? pending.promise : original(store, id);
  const first = c.openVersionDialog('a');
  await new Promise(setImmediate);
  await c.openVersionDialog('b');
  pending.resolve(commits.a);
  await first;
  assert.equal(c.state.detailCommitId, 'b');
  assert.equal($('#versionDialogTitle').textContent, 'Beta label');
});

for (const dismiss of ['button', 'cancel', 'backdrop', 'native close']) {
  test(`${dismiss} invalidates details before a later package result`, async () => {
    const { c, $ } = setup();
    const pending = deferred(), original = c.packageForCommit;
    await c.openVersionDialog('a');
    c.packageForCommit = () => pending.promise;
    const opening = c.openVersionDialog('b');
    await new Promise(setImmediate);
    if (dismiss === 'button') $('#closeVersionDialogButton').dispatch('click');
    else if (dismiss === 'cancel') $('#versionDialog').dispatch('cancel', { preventDefault() {} });
    else if (dismiss === 'backdrop') $('#versionDialog').dispatch('click', { clientX: -1, clientY: -1 });
    else { $('#versionDialog').close(); $('#versionDialog').dispatch('close'); }
    pending.resolve(await original({ id: 'b', sourceFileName: 'beta.pptx' }));
    await opening;
    assert.equal($('#versionDialog').open, false);
    assert.equal(c.state.detailCommitId, '');
  });
}

test('queued old close event does not cancel a newer dialog request or shown session', async () => {
  const { c, $ } = setup();
  await c.openVersionDialog('a');
  $('#closeVersionDialogButton').dispatch('click');
  const pending = deferred(), original = c.packageForCommit;
  c.packageForCommit = () => pending.promise;
  const opening = c.openVersionDialog('b');
  $('#versionDialog').dispatch('close');
  pending.resolve(await original({ id: 'b', sourceFileName: 'beta.pptx' }));
  await opening;
  $('#versionDialog').dispatch('close');
  assert.equal($('#versionDialog').open, true);
  assert.equal(c.state.detailCommitId, 'b');
});

for (const boundary of ['replacement', 'reset']) {
  test(`${boundary} invalidates outstanding details and label completion UI`, async () => {
    const { c, $, commits, writes, renders, toasts } = setup();
    await c.openVersionDialog('a');
    $('#versionLabelInput').value = 'Alpha revised';
    const read = deferred(), original = c.repoGet;
    c.repoGet = (store, id) => id === 'a' ? read.promise : original(store, id);
    const saving = c.saveVersionLabel();
    const details = c.openVersionDialog('a');
    if (boundary === 'replacement') await c.loadFile({ name: 'gamma.pptx' });
    else c.startNewProject();
    const before = { renders: renders.length, toasts: toasts.length };
    read.resolve(commits.a);
    await Promise.all([saving, details]);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].value.label, 'Alpha revised');
    assert.equal($('#versionDialog').open, false);
    assert.equal(c.state.detailCommitId, '');
    assert.equal(renders.length, before.renders);
    assert.equal(toasts.length, before.toasts);
  });
}

test('stale details failure is silent while current failure allows a retry', async () => {
  const { c, $, toasts } = setup();
  const pending = deferred(), original = c.packageForCommit;
  c.packageForCommit = commit => commit.id === 'a' ? pending.promise : original(commit);
  const opening = c.openVersionDialog('a');
  await new Promise(setImmediate);
  await c.openVersionDialog('b');
  pending.reject(new Error('Old read failed'));
  await opening;
  assert.equal(toasts.length, 0);
  assert.equal($('#versionDialogTitle').textContent, 'Beta label');
  c.packageForCommit = async () => { throw new Error('Current read failed'); };
  await c.openVersionDialog('a');
  assert.equal(toasts.at(-1).tone, 'error');
  assert.equal($('#saveVersionLabelButton').disabled, true);
  c.packageForCommit = original;
  await c.openVersionDialog('a');
  assert.equal($('#versionDialog').open, true);
  assert.equal($('#saveVersionLabelButton').disabled, false);
});

test('repeated Save writes the captured label exactly once and preserves immutable fields', async () => {
  const { c, $, commits, writes } = setup();
  Object.assign(commits.a, { parents: ['original-parent'], tree: 'original-tree', sourceSha256: 'original-source', schemaVersion: 1 });
  const before = structuredClone(commits.a);
  await c.openVersionDialog('a');
  $('#versionLabelInput').value = '  ' + 'x'.repeat(110) + '  ';
  const pending = deferred(), original = c.repoGet;
  c.repoGet = (store, id) => id === 'a' ? pending.promise : original(store, id);
  const save = c.saveVersionLabel();
  const duplicate = c.saveVersionLabel();
  assert.equal($('#saveVersionLabelButton').disabled, true);
  $('#versionLabelInput').value = 'not captured';
  pending.resolve(commits.a);
  await Promise.all([save, duplicate]);
  assert.equal(writes.length, 1);
  assert.deepEqual({ ...writes[0].value }, { ...before, label: 'x'.repeat(100) });
  assert.equal($('#versionDialogTitle').textContent, 'x'.repeat(100));
  assert.equal($('#saveVersionLabelButton').disabled, false);
  // Reopening resolves the actually persisted label, without a new commit.
  c.repoGet = original;
  await c.openVersionDialog('a');
  assert.equal($('#versionLabelInput').value, 'x'.repeat(100));
  $('#versionLabelInput').value = '  ';
  await c.saveVersionLabel();
  assert.equal(writes.length, 2);
  assert.equal('label' in commits.a, false);
  assert.equal($('#versionDialogTitle').textContent, 'Alpha');
});

test('label write failure releases Save for retry without pretending persistence', async () => {
  const { c, $, commits, writes, toasts } = setup();
  await c.openVersionDialog('a');
  $('#versionLabelInput').value = 'Retry label';
  const original = c.repoPut;
  c.repoPut = async () => { throw new Error('Quota'); };
  await c.saveVersionLabel();
  assert.equal(commits.a.label, 'Alpha label');
  assert.equal(writes.length, 0);
  assert.equal($('#saveVersionLabelButton').disabled, false);
  assert.equal(toasts.at(-1).tone, 'error');
  c.repoPut = original;
  await c.saveVersionLabel();
  assert.equal(writes.length, 1);
  assert.equal(commits.a.label, 'Retry label');
});

test('old save completion or failure cannot update a new same-commit dialog', async () => {
  for (const fail of [false, true]) {
    const { c, $, toasts } = setup();
    await c.openVersionDialog('a');
    $('#versionLabelInput').value = 'Saved Alpha';
    const pending = deferred(), original = c.repoPut;
    c.repoPut = async (...args) => { await pending.promise; return original(...args); };
    const save = c.saveVersionLabel();
    await new Promise(setImmediate);
    $('#closeVersionDialogButton').dispatch('click');
    await c.openVersionDialog('a');
    $('#versionLabelInput').value = 'New draft';
    const title = $('#versionDialogTitle').textContent;
    if (fail) pending.reject(new Error('Old quota failure')); else pending.resolve();
    await save;
    assert.equal($('#versionDialogTitle').textContent, title);
    assert.equal($('#versionLabelInput').value, 'New draft');
    assert.equal(toasts.length, 0);
    assert.equal($('#saveVersionLabelButton').disabled, false);
  }
});

for (const boundary of ['openProject', 'loadStoredCommit', 'switchBranch']) {
  test(`${boundary} closes details and invalidates pending reads immediately`, async () => {
    const { c, $, commits } = setup();
    await c.openVersionDialog('a');
    const oldPackage = deferred(), nextRead = deferred(), original = c.packageForCommit;
    c.packageForCommit = () => oldPackage.promise;
    const details = c.openVersionDialog('b');
    await new Promise(setImmediate);
    c.repoGet = () => nextRead.promise;
    c.getBranchRef = () => nextRead.promise;
    const change = c[boundary](boundary === 'switchBranch' ? 'refs/heads/other' : 'other');
    assert.equal($('#versionDialog').open, false);
    assert.equal(c.state.detailCommitId, '');
    oldPackage.resolve(await original(commits.b));
    await details;
    assert.equal($('#versionDialog').open, false);
    nextRead.resolve(null);
    await change;
  });
}

test('saved label survives a fresh app state without changing export payload', async () => {
  const first = setup();
  await first.c.openVersionDialog('a');
  first.$('#versionLabelInput').value = 'Persisted Alpha';
  await first.c.saveVersionLabel();
  const fresh = setup();
  fresh.c.repoGet = async (_store, id) => structuredClone(first.commits[id]);
  await fresh.c.openVersionDialog('a');
  assert.equal(fresh.$('#versionDialogTitle').textContent, 'Persisted Alpha');
  await fresh.c.downloadCommitPptx('a');
  assert.equal(fresh.saves[0].blob, fresh.blobs.a);
  assert.equal(fresh.saves[0].filename, 'alpha-v1.pptx');
  assert.equal(fresh.writes.length, 0);
});

test('a pending save remains single-flight when the same commit is reopened', async () => {
  const { c, $, writes } = setup();
  await c.openVersionDialog('a');
  $('#versionLabelInput').value = 'First label';
  const pending = deferred(), original = c.repoPut;
  c.repoPut = async (...args) => { await pending.promise; return original(...args); };
  const first = c.saveVersionLabel();
  await new Promise(setImmediate);
  $('#closeVersionDialogButton').dispatch('click');
  await c.openVersionDialog('a');
  $('#versionLabelInput').value = 'Second label';
  assert.equal($('#saveVersionLabelButton').disabled, true);
  await c.saveVersionLabel();
  pending.resolve();
  await first;
  assert.equal(writes.length, 1);
  assert.equal(writes[0].value.label, 'First label');
  assert.equal($('#versionLabelInput').value, 'Second label');
  assert.equal($('#saveVersionLabelButton').disabled, false);
  await c.saveVersionLabel();
  assert.equal(writes.length, 2);
  assert.equal(writes[1].value.label, 'Second label');
});

test('missing commit and closed dialog cannot save a stale label', async () => {
  const { c, $, commits, writes } = setup();
  await c.openVersionDialog('a');
  delete commits.b;
  await c.openVersionDialog('b');
  await c.saveVersionLabel();
  assert.equal(writes.length, 0);
  assert.equal(c.state.detailCommitId, '');
  assert.equal($('#versionDialog').open, false);
  await c.openVersionDialog('a');
  $('#closeVersionDialogButton').dispatch('click');
  await c.saveVersionLabel();
  assert.equal(writes.length, 0);
});
