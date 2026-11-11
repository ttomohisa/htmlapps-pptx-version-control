import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const workflow = read('.github/workflows/release.yml');
const prepare = read('scripts/prepare-release.mjs');

test('release workflow is not triggered by an unmerged pull request', () => {
  assert.ok(workflow.includes('  push:'));
  assert.ok(workflow.includes('    branches:\n      - main'));
  assert.ok(!workflow.includes('  pull_request:'), 'untrusted PR builds cannot publish releases');
  assert.ok(workflow.includes("if: github.ref == 'refs/heads/main'"), 'only main can publish');
  assert.ok(workflow.includes('    needs: verify'), 'release requires the successful standalone validation job');
  assert.ok(workflow.includes('      contents: write'), 'publish job has permission to create the tag and release');
  assert.ok(workflow.includes('  cancel-in-progress: false'), 'a newer push must not interrupt an in-progress release');
});

test('release workflow protects existing tags and release entries', () => {
  assert.ok(workflow.includes('gh release view "$tag"'), 'do not republish a tag');
  assert.ok(workflow.includes('if [[ "$ref_sha" != "$GITHUB_SHA" ]]'), 'do not repoint an existing tag');
  assert.ok(workflow.includes('gh release create "$tag"'), 'a matching version creates the release');
  assert.ok(workflow.includes('--verify-tag'), 'release only an existing verified tag');
  assert.ok(workflow.includes('scripts/check-repository.ps1'), 'built HTML is validated before publishing');
  assert.ok(workflow.includes('actions/download-artifact@'), 'publish receives the verified build');
});

test('standalone release assets include both formats, license and checksums', () => {
  assert.ok(prepare.includes('app.config.json'));
  assert.ok(prepare.includes('CHANGELOG.md'));
  assert.ok(prepare.includes('dist/index.html'));
  assert.ok(prepare.includes('dist/index.self-extract.html'));
  assert.ok(prepare.includes('THIRD_PARTY_NOTICES.md'));
  assert.ok(prepare.includes('LICENSE'));
  assert.ok(prepare.includes("crypto.createHash('sha256')"));
  assert.ok(prepare.includes('SHA256SUMS.txt'));
  execFileSync(process.execPath, ['--check', fileURLToPath(new URL('../scripts/prepare-release.mjs', import.meta.url))], {stdio:'pipe'});
});
