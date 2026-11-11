import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const workflow = read('.github/workflows/release.yml');
const prepare = read('scripts/prepare-release.mjs');
const publish = read('scripts/publish-release.sh');

test('release workflow verifies PR builds but only publishes after main validation', () => {
  assert.ok(workflow.includes('  pull_request:'), 'PR can test packaging without publishing');
  assert.ok(workflow.includes('  push:'));
  assert.ok(workflow.includes('    branches:\n      - main'));
  assert.ok(workflow.includes("if: github.event_name != 'pull_request' && github.ref == 'refs/heads/main'"), 'only main can publish');
  assert.ok(workflow.includes('  package:\n    needs: verify'), 'packaging needs the validated build');
  assert.ok(workflow.includes('    needs: package'), 'release needs verified package artifacts');
  assert.ok(workflow.includes('      contents: write'), 'only the release job needs content write permission');
  assert.ok(workflow.includes('sha256sum -c SHA256SUMS.txt'), 'PR must check packaged assets');
  assert.ok(workflow.includes('unzip -t release-assets/*.zip'), 'PR must verify the archive');
  assert.ok(workflow.includes('  cancel-in-progress: false'), 'a newer push must not interrupt an in-progress release');
});

test('release workflow protects existing tags and release entries', () => {
  assert.ok(workflow.includes('bash scripts/publish-release.sh'), 'publish uses the dedicated audited script');
  assert.ok(workflow.includes('node --test test/release-publish-regression.mjs'), 'PR tests the publish script without credentials');
  assert.ok(publish.includes('gh release view "$tag"'), 'do not republish a release');
  assert.ok(publish.includes('git ls-remote --tags origin'), 'existing remote tags are checked read-only');
  assert.ok(publish.includes('gh release create "$tag"'), 'release creation is performed by GitHub CLI');
  assert.ok(publish.includes('--target "$GITHUB_SHA"'), 'missing tag is created from the exact commit');
  assert.ok(publish.includes('--verify-tag'), 'existing matching tag is used as-is');
  assert.ok(!publish.includes('gh api -X POST'), 'avoid the failing separate reference-creation request');
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
