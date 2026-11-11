import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { deflateRawSync } from 'node:zlib';

const source = fs.readFileSync(new URL('../src/index.template.html', import.meta.url), 'utf8');
const getLine = prefix => {
  const matches = source.split('\n').filter(line => line.startsWith(prefix));
  assert.equal(matches.length, 1, prefix);
  return matches[0];
};
const between = (start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, start);
  return source.slice(a, b);
};

const zipContext = vm.createContext({ TextEncoder, TextDecoder, Blob, DecompressionStream, Uint8Array, DataView });
const zipCode = [
  getLine('class PptxError '),
  getLine('const utf8='),
  getLine('function u16('),
  getLine('function findEocd('),
  getLine('function isUnsafePath('),
  getLine('function readZipDirectory('),
  getLine('function localPayload('),
  getLine('function crc32Bytes('),
  getLine('function concatChunks('),
  getLine('function makeStoredZip('),
  getLine('function rebuildZip('),
  getLine('async function readZipEntry('),
  getLine('async function verifyRebuild(')
].join('\n');
vm.runInContext(zipCode + '\nthis.zip = { makeStoredZip, readZipDirectory, readZipEntry, rebuildZip, verifyRebuild };', zipContext);
const zip = zipContext.zip;

test('valid stored part passes CRC and full package verification', async () => {
  const bytes = zip.makeStoredZip([{ name: 'ppt/media/file.bin', data: Uint8Array.from([1, 2, 3, 4]) }]);
  const archive = zip.readZipDirectory(bytes.buffer);
  assert.deepEqual(Array.from(await zip.readZipEntry(archive, 'ppt/media/file.bin')), [1, 2, 3, 4]);
  assert.equal(await zip.verifyRebuild(archive, zip.rebuildZip(archive).buffer), true);
});

test('tampered stored part fails read and cannot be reported as a verified export', async () => {
  const name = 'ppt/media/file.bin';
  const bytes = zip.makeStoredZip([{ name, data: Uint8Array.from([1, 2, 3, 4]) }]);
  const changed = bytes.slice();
  changed[30 + new TextEncoder().encode(name).length + 1] ^= 255;
  const archive = zip.readZipDirectory(changed.buffer);
  await assert.rejects(zip.readZipEntry(archive, name), { code: 'invalidZip' });
  await assert.rejects(zip.verifyRebuild(archive, zip.rebuildZip(archive).buffer), { code: 'verifyFailed' });
});

test('compressed payload cannot exceed its advertised length while streaming', async () => {
  const name = 'ppt/media/oversized.bin';
  const compressed = deflateRawSync(Buffer.alloc(100_000, 65));
  const bytes = zip.makeStoredZip([{ name, data: compressed }]);
  const view = new DataView(bytes.buffer);
  const archive = zip.readZipDirectory(bytes.buffer), central = view.getUint32(bytes.length - 6, true);
  assert.ok(archive.entries.length === 1);
  view.setUint16(8, 8, true);
  view.setUint16(central + 10, 8, true);
  view.setUint32(central + 24, 10, true);
  const fake = zip.readZipDirectory(bytes.buffer);
  await assert.rejects(zip.readZipEntry(fake, name), { code: 'unsafePackage' });
});

const comparisonContext = vm.createContext({
  console,
  stableStringify: value => JSON.stringify(value),
  sha256Text: async () => '',
  language: 'en'
});
vm.runInContext(between('function normalizeDiffText', 'const COMPARE_CORE_SCHEMA_VERSION'), comparisonContext);
const makeObject = (id, target = '') => ({
  stableId: id, sourceId: id, name: id, type: 'shape', placeholder: 'title',
  text: 'Example', fingerprint: id + target, geometry: { x: 0, y: 0, width: 10000, height: 10000 },
  formatting: { fontSize: 12 }, textLayout: { anchor: 't' },
  hyperlinks: target ? [{ kind: 'hlinkClick', target, action: '', tooltip: '' }] : []
});
const slide = objects => ({ stableId: 'slide-1', index: 1, title: 'Example', objects, notesText: '' });

test('changed hyperlink target is an object-level semantic difference', () => {
  const a = slide([makeObject('o1', 'https://example.com/a')]);
  const b = slide([makeObject('o1', 'https://example.com/b')]);
  const diff = comparisonContext.diffSlidePair({ original: a, revised: b });
  assert.equal(diff.objectChanges.length, 1);
});

test('changing only shape/image stacking order is visible in object diff', () => {
  const a = slide([makeObject('shape-1'), { ...makeObject('image-2'), type: 'image' }]);
  const b = slide([a.objects[1], a.objects[0]]);
  const diff = comparisonContext.diffSlidePair({ original: a, revised: b });
  assert.ok(diff.objectChanges.some(item => item.kind === 'reordered'));
});

const mergeContext = vm.createContext({
  stableStringify: v => JSON.stringify(v),
  matchSemanticObjects: (a, b) => a.objects.map((v, i) => ({
    original: { ...v, _objectIndex: i + 1 },
    revised: { ...b.objects[i], _objectIndex: i + 1 }
  })),
  matchSemanticSlides: (a, b) => a.slides.map((v, i) => ({
    original: { ...v, _matchIndex: i },
    revised: { ...b.slides[i], _matchIndex: i }
  }))
});
vm.runInContext(between('function deepCloneJson', 'async function commitAncestorDistances') +
  '\nthis.merge = threeWayMergeSemantic;', mergeContext);

const snapshot = formatting => ({
  slideSize: { width: 100, height: 50 },
  slides: [{ stableId: 'slide-1', sourceId: '1', notesText: '', themeFingerprint: '',
    objects: [{ stableId: 'o1', sourceId: '1', type: 'shape', text: 'Example',
      formatting, geometry: { x: 0, y: 0, width: 10, height: 10 } }] }]
});

test('independent font size and fill edits merge without a false semantic conflict', () => {
  const base = snapshot({ fontSize: 12, fill: 'white' });
  const ours = snapshot({ fontSize: 14, fill: 'white' });
  const theirs = snapshot({ fontSize: 12, fill: 'blue' });
  const result = mergeContext.merge(base, ours, theirs);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.merged.slides[0].objects[0].formatting.fontSize, 14);
  assert.equal(result.merged.slides[0].objects[0].formatting.fill, 'blue');
});

test('divergent edits to the same formatting property remain explicit conflicts', () => {
  const result = mergeContext.merge(
    snapshot({ fontSize: 12, fill: 'white' }),
    snapshot({ fontSize: 14, fill: 'white' }),
    snapshot({ fontSize: 18, fill: 'white' })
  );
  assert.equal(result.conflicts.length, 1);
  assert.match(result.conflicts[0].path, /fontSize$/);
});

test('manual text resolution keeps separate paragraphs rather than injecting raw newlines', () => {
  const code = getLine('function setTextContentInObject(');
  assert.match(code, /split\('\\n'\)/);
  assert.match(code, /parent\.appendChild\(p\)/);
  assert.match(code, /xml:space/);
});

test('changed source bytes remain saveable even if the semantic fingerprint is equal', () => {
  assert.match(source, /fileState==='changed'\|\|fileState==='noise'/);
  assert.match(source, /parent&&parent\.sourceSha256===state\.model\.sourceSha256/);
});

test('mixed-slide materialization detects a changed object z-order before writing OOXML', () => {
  const guard = getLine('function relativeObjectOrderUnchanged(');
  const context = vm.createContext({});
  vm.runInContext(guard + '\nthis.check = relativeObjectOrderUnchanged;', context);
  const original = { objects: [{ stableId: 'shape' }, { stableId: 'image' }] };
  const revised = { objects: [{ stableId: 'image' }, { stableId: 'shape' }] };
  assert.equal(context.check(original, revised), false);
  assert.equal(context.check(original, original), true);
  assert.match(getLine('async function materializeMixedSlide('), /relativeObjectOrderUnchanged/);
});
