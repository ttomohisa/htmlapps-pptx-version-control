import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { Blob } from 'node:buffer';

const source = fs.readFileSync(new URL('../src/index.template.html', import.meta.url), 'utf8');
function sliceBetween(startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  if (start < 0 || end < 0) throw new Error(`Could not extract ${startNeedle}`);
  return source.slice(start, end);
}
const context = {
  console,
  Blob,
  state: { model: null, file: null, currentBranchRef: 'refs/heads/main' },
  safeBase: value => String(value || ''),
  commitDisplayName: commit => commit?.label || commit?.message || '',
  repoGet: async () => null,
  treeForCommit: async commit => ({ package: { filename: commit?.sourceFileName || '' }, sourceSha256: commit?.sourceSha256 || '', semantic: { fingerprint: commit?.fingerprint || '' } }),
  packageForCommit: async commit => ({ tree: { package: { filename: commit?.sourceFileName || '' }, sourceSha256: commit?.sourceSha256 || '' }, obj: { data: new Blob(['pptx']) } }),
  semanticForCommit: async () => ({ schemaVersion: 1, slides: [] }),
  semanticSnapshot: value => value,
  stableStringify: value => JSON.stringify(value),
  sha256Text: async value => crypto.createHash('sha256').update(String(value)).digest('hex')
};
vm.createContext(context);
vm.runInContext(sliceBetween('function normalizeDiffText', 'const COMPARE_CORE_SCHEMA_VERSION'), context);
vm.runInContext(sliceBetween('const COMPARE_CORE_SCHEMA_VERSION', 'async function showCommitDiff'), context);

const geometry = (x = 0) => ({ x, y: 0, width: 1000000, height: 500000, rotation: 0 });
const formatting = (size = 20) => ({ fontFamily: 'Aptos', fontSize: size, bold: false, italic: false, textColor: '#000000', fill: null, lineColor: null, lineWidth: null });
const object = (id, { text = '', x = 0, size = 20, type = 'shape', resource = null, fingerprint = id } = {}) => ({ stableId: id, sourceId: id, name: id, type, placeholder: '', text, geometry: geometry(x), formatting: formatting(size), textLayout: { anchor: 'ctr', align: 'l', lIns: 0, rIns: 0, tIns: 0, bIns: 0 }, resource, shapePreset: 'rect', isTextBox: true, fingerprint });
const slide = (id, index, objects = [], notesText = '', fingerprint = id) => ({ index, stableId: id, sourceId: id, path: `ppt/slides/${id}.xml`, title: objects[0]?.text || id, notesText, themeFingerprint: 'theme', fingerprint, objects });
const snapshot = slides => ({ schemaVersion: 1, slides });
const run = (name, before, after, expected) => {
  const result = context.compareSemanticSnapshots(before, after);
  for (const [key, value] of Object.entries(expected)) {
    if (result.summary[key] !== value) throw new Error(`${name}: expected ${key}=${value}, got ${result.summary[key]}`);
  }
  console.log(`ok: ${name}`);
  return result;
};

run('unchanged', snapshot([slide('s1', 1, [object('o1', { text: 'Hello' })])]), snapshot([slide('s1', 1, [object('o1', { text: 'Hello' })])]), { changedSlides: 0 });
run('slide insertion', snapshot([slide('s1', 1), slide('s2', 2)]), snapshot([slide('s1', 1), slide('sx', 2), slide('s2', 3)]), { addedSlides: 1, movedSlides: 0 });
const shiftedInsertion = run('slide insertion with shifted PowerPoint ids',
  snapshot([
    slide('slide-256', 1, [object('a1', { text: 'Cover' })], '', 'cover'),
    slide('slide-257', 2, [object('a2', { text: 'Sales Overview Revenue 12.5' })], '', 'sales-old'),
    slide('slide-258', 3, [object('a3', { text: 'Visual Assets' })], '', 'visual-old'),
    slide('slide-259', 4, [object('a4', { text: 'Layout and Formatting' })], '', 'layout-old'),
    slide('slide-260', 5, [object('a5', { text: 'Object Inventory' })], '', 'objects-old'),
    slide('slide-261', 6, [object('a6', { text: 'Closing' })], '', 'closing-old')
  ]),
  snapshot([
    slide('slide-256', 1, [object('b1', { text: 'Cover' })], '', 'cover'),
    slide('slide-257', 2, [object('b2', { text: 'New Executive Summary' })], '', 'executive-new'),
    slide('slide-258', 3, [object('b3', { text: 'Sales Overview Revenue 13.2' })], '', 'sales-new'),
    slide('slide-259', 4, [object('b4', { text: 'Visual Assets' })], '', 'visual-new'),
    slide('slide-260', 5, [object('b5', { text: 'Object Inventory' })], '', 'objects-new'),
    slide('slide-261', 6, [object('b6', { text: 'Layout and Formatting' })], '', 'layout-new'),
    slide('slide-262', 7, [object('b7', { text: 'Closing' })], '', 'closing-new')
  ]),
  { addedSlides: 1, removedSlides: 0 });
if (!shiftedInsertion.rows.some(row => !row.original && row.revised?.title.includes('New Executive Summary'))) throw new Error('Shifted-id insertion was not classified as Added');
if (!shiftedInsertion.rows.some(row => row.original?.title.includes('Sales Overview') && row.revised?.title.includes('Sales Overview'))) throw new Error('Sales Overview was not matched across shifted slide ids');
if (!shiftedInsertion.rows.some(row => row.original?.title.includes('Closing') && row.revised?.title.includes('Closing'))) throw new Error('Closing was not matched across shifted slide ids');

const textResult = run('text and number', snapshot([slide('s1', 1, [object('o1', { text: 'Revenue 1,200', fingerprint: 'a' })])]), snapshot([slide('s1', 1, [object('o1', { text: 'Revenue 1,450', fingerprint: 'b' })])]), { text: 1, number: 1 });
const image = { kind: 'image', sha256: 'abc', size: 123 };
run('image move is layout', snapshot([slide('s1', 1, [object('img', { type: 'image', resource: image, fingerprint: 'a' })])]), snapshot([slide('s1', 1, [object('img', { type: 'image', resource: image, x: 50000, fingerprint: 'b' })])]), { image: 0, layout: 1 });
run('formatting', snapshot([slide('s1', 1, [object('o1', { text: 'Title', size: 20, fingerprint: 'a' })])]), snapshot([slide('s1', 1, [object('o1', { text: 'Title', size: 24, fingerprint: 'b' })])]), { formatting: 1 });
run('speaker notes', snapshot([slide('s1', 1, [], 'old')]), snapshot([slide('s1', 1, [], 'new')]), { notes: 1 });

const from = { kind: 'working', id: 'working:a', cacheKey: 'working:a', filename: 'a.pptx', sourceSha256: 'a', semanticFingerprint: 'a', _model: snapshot([slide('s1', 1, [object('o1', { text: 'Revenue 1,200', fingerprint: 'a' })])]), _file: new Blob(['a']) };
const to = { kind: 'working', id: 'working:b', cacheKey: 'working:b', filename: 'b.pptx', sourceSha256: 'b', semanticFingerprint: 'b', _model: snapshot([slide('s1', 1, [object('o1', { text: 'Revenue 1,450', fingerprint: 'b' })])]), _file: new Blob(['b']) };
const session = await context.buildComparisonSession(from, to, { mode: 'working' });
if (session.categories.find(x => x.id === 'text')?.count !== 1 || session.categories.find(x => x.id === 'number')?.count !== 1) throw new Error('Category alignment failed');
if (!session.slidePairs[0].markers.some(x => x.id.endsWith(':text:1'))) throw new Error('Stable marker ID missing');
if (context.comparisonRendererCacheKey(from, 's1', 'renderer-v1') !== 'renderer-v1|working:a|s1') throw new Error('Renderer cache key is not stable');
if ((await context.packageForComparisonInput(from)).kind !== 'working') throw new Error('Working package resolver failed');
console.log(`ok: Compare Core session ${session.id.slice(0, 12)}`);
