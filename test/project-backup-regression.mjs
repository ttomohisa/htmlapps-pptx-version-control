import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const html = fs.readFileSync(new URL('../src/index.template.html', import.meta.url), 'utf8');
const fixture = JSON.parse(fs.readFileSync(new URL('fixtures/merge-lineage.pptxvc', import.meta.url)));
const instant = '2026-01-02T03:04:05.000Z';
const limit = 600 * 1024 * 1024;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const noop = () => {};
const sliceSource = (first, last) => html.slice(html.indexOf(first), html.indexOf(last, html.indexOf(first)));

function app(payload, { language = 'en', byteLimit, largeReader = false, stringLimit = Infinity } = {}) {
  const downloads = [], messages = [], writes = [], objects = new Map();
  for (const { data, ...item } of payload.objects) {
    objects.set(item.id, { ...item, data: new Blob([Buffer.from(data, 'base64')]) });
  }
  const context = vm.createContext({
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [instant])); } },
    Blob, Uint8Array, TextEncoder, TextDecoder, btoa, atob, language,
    JSON: { stringify: JSON.stringify, parse(text) {
      if (text.length > stringLimit) throw Error('string too large');
      return JSON.parse(text);
    } },
    state: { busy: false, project: payload.project },
    console: { error: noop }, setStatus: noop, showState: noop, updateProgress: noop,
    repoGet: async (store, id) => store === 'projects' ? payload.project : objects.get(id),
    getJsonObject: async id => JSON.parse(await objects.get(id).data.text()),
    reachableCommits: async () => payload.commits, repoGetByProject: async () => payload.refs,
    safeBase: name => name, downloadBlobFile: (blob, name) => downloads.push({ blob, name }),
    URL: { createObjectURL: blob => { downloads.push({ blob }); return 'blob:backup'; }, revokeObjectURL: noop },
    document: { createElement: () => ({ click: noop, remove: noop }), body: { append: noop } }, setTimeout: noop,
    AppToast: { show: message => messages.push(message) }, randomId: () => 'new-project',
    repoWrite: async record => writes.push(record), refreshLocalProjects: noop, openProject: noop,
    sha256Bytes: digest, sha256Text: digest,
    readZipDirectory: () => ({}), readZipText: async () => '<xml/>', parseXml: () => ({}),
  });
  const locale = html.split('\n').filter(line => line.includes('projectBackupSizeError') && line.startsWith('Object.assign')).join('\n');
  const helpers = sliceSource('function bytesToBase64(', 'function mediaExtension(');
  let backup = sliceSource('function validateProjectImportPayload(', 'async function startNewProject(');
  if (byteLimit !== undefined) backup = backup.replace(/(const PROJECT_BACKUP_MAX_BYTES\s*=)[^;]+;/, '$1' + ' ' + byteLimit + ';');
  if (largeReader) backup = backup.replace(/(const PROJECT_BACKUP_SMALL_BYTES\s*=)[^;]+;/, '$1 0;');
  vm.runInContext("const translations={en:{},ja:{}};function t(key){return translations[language][key]||key;}\n" +
    locale + '\n' + helpers + '\n' + backup, context);
  return { context, downloads, messages, writes, objects };
}

function sample() {
  const payload = structuredClone(fixture);
  payload.exportedAt = instant;
  payload.project.name = '営業会議 🎁 "Q4"';
  return payload;
}

test('export measures JSON metadata, UTF-8 names and padded base64 before reading large binary objects', async () => {
  const payload = sample(), { context, objects, downloads, messages } = app(payload);
  const item = payload.objects.find(o => o.kind === 'pptx');
  const huge = 450 * 1024 * 1024;
  item.size = huge;
  item.data = '';
  const expected = Buffer.byteLength(JSON.stringify(payload)) + 4 * Math.ceil(huge / 3);
  let reads = 0;
  const record = objects.get(item.id);
  record.size = huge;
  record.data = { size: huge, arrayBuffer() { reads++; throw Error('read before preflight'); },
    slice() { reads++; throw Error('read before preflight'); } };
  await context.exportProject(payload.project.id);
  assert.equal(reads, 0);
  assert.equal(downloads.length, 0);
  assert.match(messages.at(-1).message.replaceAll(',', ''), new RegExp(String(expected)));
  assert.match(messages.at(-1).message, /600 MiB/);
});

test('a file at the byte limit downloads and reimports, one extra metadata byte blocks both directions', async () => {
  const payload = sample(), bytes = Buffer.byteLength(JSON.stringify(payload));
  const allowed = app(payload, { byteLimit: bytes });
  await allowed.context.exportProject(payload.project.id);
  assert.equal(allowed.downloads.length, 1);
  assert.equal(allowed.downloads[0].blob.size, bytes);
  const json = JSON.parse(await allowed.downloads[0].blob.text());
  assert.deepEqual(json, payload);
  await allowed.context.importProjectFile(allowed.downloads[0].blob);
  assert.equal(allowed.writes.length, 1);
  assert.equal(allowed.writes[0].project.name, payload.project.name);
  payload.project.name += '!';
  const denied = app(payload, { byteLimit: bytes });
  await denied.context.exportProject(payload.project.id);
  assert.equal(denied.downloads.length, 0);
  await denied.context.importProjectFile(new Blob([JSON.stringify(payload)]));
  assert.equal(denied.writes.length, 0);
  assert.equal(denied.messages[0].message, denied.messages[1].message);
});

test('over-limit imports report the exact file size and limit in each language before reading', async () => {
  for (const language of ['en', 'ja']) {
    const { context, messages, writes } = app(sample(), { language });
    await context.importProjectFile({ size: limit + 1, text() { throw Error('read before limit check'); } });
    assert.match(messages.at(-1).message.replaceAll(',', ''), /629145601/);
    assert.match(messages.at(-1).message, /600 MiB/);
    assert.match(messages.at(-1).message, language === 'en' ? /limit/i : /上限/);
    assert.equal(writes.length, 0);
    await context.importProjectFile({ size: 601 * 1024 * 1024 });
    assert.match(messages.at(-1).message, /601 MiB/);
  }
});

test('a large JSON-escaped object survives chunk boundaries and the JavaScript string ceiling', async () => {
  const payload = sample(), item = payload.objects.find(o => o.kind === 'pptx');
  const padded = ' '.repeat(256 * 1024 - 2) + '\\u' + item.data.charCodeAt(0).toString(16).padStart(4, '0') +
    ' '.repeat(1024 * 1024) + item.data.slice(1);
  const file = new Blob([JSON.stringify(payload).replace('"' + item.data + '"', '"' + padded + '"')]);
  const { context, writes } = app(payload, { largeReader: true, stringLimit: 1024 * 1024 });
  await context.importProjectFile(file);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].objects.length, payload.objects.length);
});

test('large legacy JSON can be read in slices with reordered keys, pretty printing and escaped metadata', async () => {
  const payload = sample();
  payload.project.note = 'テスト \\"data\\": {], 😀';
  const reordered = { objects: payload.objects.map(o => ({ data: o.data, ...o })),
    project: payload.project, commits: payload.commits, refs: payload.refs,
    schemaVersion: 1, format: payload.format };
  const json = JSON.stringify(reordered, null, 2);
  class SlicedFile extends Blob { text() { throw Error('whole file read'); } }
  const file = new SlicedFile([json]);
  const { context, writes } = app(payload, { largeReader: true });
  await context.importProjectFile(file);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].project.note, payload.project.note);
  for (const record of writes[0].objects) {
    assert.equal(digest(new Uint8Array(await record.data.arrayBuffer())), record.id);
  }
});
