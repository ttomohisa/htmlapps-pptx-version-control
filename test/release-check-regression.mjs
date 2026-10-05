import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pptx-version-parity-'));
try {
  for (const name of ['src/index.template.html', 'pptx-version-control.html', 'test/release-parity-regression.mjs']) {
    const destination = path.join(temporary, name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(new URL(name, root), destination);
  }
  const check = () => spawnSync(process.execPath, ['test/release-parity-regression.mjs', '--root-only'], { cwd: temporary, encoding: 'utf8' });
  const current = check();
  assert.equal(current.status, 0, `Pre-build parity must work without dist: ${current.stderr}`);
  fs.appendFileSync(path.join(temporary, 'src/index.template.html'), '\n<!-- unsynchronized source change -->\n');
  const stale = check();
  assert.notEqual(stale.status, 0, 'A stale committed root release must fail before the build repairs it');
  assert.match(stale.stderr, /pptx-version-control\.html does not match/);
  const repositoryCheck = fs.readFileSync(new URL('scripts/check-repository.ps1', root), 'utf8');
  const parityPosition = repositoryCheck.indexOf('--root-only');
  const buildPosition = repositoryCheck.indexOf('& (Join-Path $Root "build-standalone.ps1")');
  assert.ok(parityPosition >= 0 && parityPosition < buildPosition, 'Repository check must validate committed root before building');
  console.log('ok: pre-build parity works without dist and rejects stale root releases');
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
