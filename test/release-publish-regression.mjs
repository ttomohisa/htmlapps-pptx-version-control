import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const mainSha = 'a'.repeat(40);
const script = fileURLToPath(new URL('../scripts/publish-release.sh', import.meta.url));

function setup(t, opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pptxvc-release-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  const assets = path.join(dir, 'release-assets');
  fs.mkdirSync(assets);
  fs.writeFileSync(path.join(dir, 'app.config.json'), '{"version":"1.1.7"}');
  const prefix = 'htmlapps-pptx-version-control-v1.1.7';
  for (const name of [prefix + '.html', prefix + '.self-extract.html', prefix + '.zip',
    'SHA256SUMS.txt', 'RELEASE_NOTES.md']) {
    fs.writeFileSync(path.join(assets, name), 'non-empty test file');
  }
  const calls = path.join(dir, 'calls.txt');
  const releaseState = path.join(dir, 'release-state.txt');
  if (opts.existingRelease) fs.writeFileSync(releaseState, opts.existingRelease);
  const gh = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.MOCK_CALLS, JSON.stringify(['gh', ...args])+String.fromCharCode(10));
if (args[0] === 'release' && args[1] === 'view') {
  if (process.env.MOCK_VIEW_ERROR) {
    console.error(process.env.MOCK_VIEW_ERROR === '403' ? 'gh: forbidden (HTTP 403)' : 'gh: unavailable');
    process.exit(1);
  }
  if (!fs.existsSync(process.env.MOCK_RELEASE_STATE)) {
    console.error('release not found (HTTP 404)');
    process.exit(1);
  }
  console.log(fs.readFileSync(process.env.MOCK_RELEASE_STATE, 'utf8').trim() === 'draft' ? 'true' : 'false');
} else if (args[0] === 'release' && args[1] === 'create') {
  if (process.env.MOCK_CREATE_ERROR === 'true') {
    console.error('gh: Not Found (HTTP 404)');
    process.exit(1);
  }
  fs.writeFileSync(process.env.MOCK_RELEASE_STATE, 'published');
} else {
  console.error('Unexpected mock GH command:', args.join(' '));
  process.exit(1);
}
`;
  const git = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.MOCK_CALLS, JSON.stringify(['git', ...args])+String.fromCharCode(10));
if (args[0] !== 'ls-remote' || args[1] !== '--tags') process.exit(1);
if (process.env.MOCK_TAG_SHA) {
  const tag = 'refs/tags/v1.1.7';
  if (process.env.MOCK_ANNOTATED === 'true') {
    console.log('b'.repeat(40) + String.fromCharCode(9) + tag);
    console.log(process.env.MOCK_TAG_SHA + String.fromCharCode(9) + tag + '^{}');
  } else {
    console.log(process.env.MOCK_TAG_SHA + String.fromCharCode(9) + tag);
  }
}
`;
  for (const [name, content] of [['gh', gh], ['git', git]]) {
    const file = path.join(bin, name);
    fs.writeFileSync(file, content, { mode: 0o755 });
    fs.chmodSync(file, 0o755);
  }
  function run(extraEnv = {}) {
    const env = {
      ...process.env,
      PATH: bin + path.delimiter + process.env.PATH,
      MOCK_CALLS: calls,
      MOCK_RELEASE_STATE: releaseState,
      MOCK_TAG_SHA: opts.tagSha || '',
      MOCK_ANNOTATED: String(Boolean(opts.annotated)),
      MOCK_VIEW_ERROR: opts.viewError || '',
      MOCK_CREATE_ERROR: String(Boolean(opts.createError) ? 'true' : ''),
      GITHUB_REPOSITORY: 'ttomohisa/htmlapps-pptx-version-control',
      GITHUB_SHA: mainSha,
      GITHUB_REF: 'refs/heads/main',
      GH_TOKEN: 'mocked-token',
      ...extraEnv,
    };
    const result = spawnSync('bash', [script], { cwd: dir, env, encoding: 'utf8' });
    const commands = fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trim().split(String.fromCharCode(10)).map(JSON.parse) : [];
    return { ...result, commands };
  }
  return { run };
}

test('missing tag uses GitHub CLI automatic tag creation at exact merged SHA', t => {
  const { run } = setup(t);
  const r = run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const created = r.commands.filter(x => x[0] === 'gh' && x[1] === 'release' && x[2] === 'create');
  assert.equal(created.length, 1);
  assert.ok(created[0].includes('--target'));
  assert.equal(created[0][created[0].indexOf('--target') + 1], mainSha);
  assert.ok(!created[0].includes('--verify-tag'));
  assert.ok(!r.commands.some(x => x.includes('api')), 'no direct git-ref POST');
});

test('existing matching lightweight tag is verified and never replaced', t => {
  const { run } = setup(t, { tagSha: mainSha });
  const r = run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const cmd = r.commands.find(x => x[0] === 'gh' && x[1] === 'release' && x[2] === 'create');
  assert.ok(cmd.includes('--verify-tag'));
  assert.ok(!cmd.includes('--target'));
});

test('existing matching annotated tag is verified by peeled commit', t => {
  const { run } = setup(t, { tagSha: mainSha, annotated: true });
  const r = run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(r.commands.some(x => x.includes('--verify-tag')));
});

test('existing tag at a different commit is never moved', t => {
  const { run } = setup(t, { tagSha: 'c'.repeat(40) });
  const r = run();
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /Refusing to move the tag/);
  assert.ok(!r.commands.some(x => x[2] === 'create'));
});

test('published release is a no-op on a later main push', t => {
  const { run } = setup(t, { existingRelease: 'published' });
  const r = run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.commands.length, 1, 'existing releases require no git query or creation');
});

test('a draft release is not mistaken for a completed publication', t => {
  const { run } = setup(t, { existingRelease: 'draft' });
  const r = run();
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /Draft v1.1.7 already exists/);
  assert.equal(r.commands.length, 1);
});

test('repository access errors are not treated as a missing release', t => {
  const { run } = setup(t, { viewError: '403' });
  const r = run();
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /HTTP 403/);
  assert.equal(r.commands.length, 1);
});

test('a release API failure propagates instead of pretending success', t => {
  const { run } = setup(t, { createError: true });
  const r = run();
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /HTTP 404/);
});

test('publishing from a non-main ref is blocked before GitHub commands', t => {
  const { run } = setup(t);
  const r = run({ GITHUB_REF: 'refs/heads/feature' });
  assert.notEqual(r.status, 0);
  assert.equal(r.commands.length, 0);
});
