import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Assemble release assets from an already validated standalone build.
// This script does not create a Git tag, contact GitHub, or publish anything.
const root = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(root, 'app.config.json'), 'utf8'));
const version = String(config.version || '');
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
  throw new Error('A stable SemVer version is required for release');
}
const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8').replace(/\r\n/g, '\n');
const lines = changelog.split('\n');
const headingIndex = lines.findIndex(line => line.startsWith('## ' + version + ' -'));
if (headingIndex === -1) throw new Error('No matching CHANGELOG entry for v' + version);
let sectionEnd = lines.findIndex((line, index) => index > headingIndex && line.startsWith('## '));
if (sectionEnd === -1) sectionEnd = lines.length;
const notes = lines.slice(headingIndex + 1, sectionEnd).join('\n').trim();
if (!notes) throw new Error('The release CHANGELOG entry is empty');

const base = 'htmlapps-pptx-version-control-v' + version;
const releaseDir = path.join(root, 'release-assets');
fs.rmSync(releaseDir, { recursive: true, force: true });
fs.mkdirSync(releaseDir, { recursive: true });
const files = [
  ['dist/index.html', base + '.html'],
  ['dist/index.self-extract.html', base + '.self-extract.html'],
];
for (const [source, name] of files) {
  const original = path.join(root, source);
  if (!fs.statSync(original).isFile()) throw new Error('Missing build: ' + source);
  fs.copyFileSync(original, path.join(releaseDir, name));
}
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'pptxvc-release-'));
try {
  const copyToStage = [
    ['dist/index.html', 'index.html'],
    ['dist/index.self-extract.html', 'index.self-extract.html'],
    ['dist/dependency-manifest.json', 'dependency-manifest.json'],
    ['dist/self-extract-manifest.json', 'self-extract-manifest.json'],
    ['README.md', 'README.md'],
    ['README.ja.md', 'README.ja.md'],
    ['LICENSE', 'LICENSE'],
    ['THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md'],
    ['assets/favicon.svg', 'favicon.svg'],
  ];
  for (const [source, name] of copyToStage) fs.copyFileSync(path.join(root, source), path.join(stage, name));
  execFileSync('zip', ['-q', '-X', '-r', path.join(releaseDir, base + '.zip'), '.'], {
    cwd: stage, stdio: 'inherit',
  });
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}
const assetNames = [base + '.html', base + '.self-extract.html', base + '.zip'];
const checksums = assetNames.map(name => {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(releaseDir, name))).digest('hex');
  return hash + '  ' + name;
});
fs.writeFileSync(path.join(releaseDir, 'SHA256SUMS.txt'), checksums.join('\n') + '\n');
fs.writeFileSync(path.join(releaseDir, 'RELEASE_NOTES.md'), [
  '# PPTX Version Control v' + version,
  '',
  '## Changes',
  '',
  notes,
  '',
  '## Downloads',
  '',
  '- Readable standalone HTML: ' + base + '.html',
  '- Self-extracting standalone HTML: ' + base + '.self-extract.html',
  '- ZIP containing HTML, manifests, license and documentation: ' + base + '.zip',
  '- SHA-256 digests: SHA256SUMS.txt',
  '',
  'Built and verified for commit ' + (process.env.GITHUB_SHA || '(local validation)') + '.',
  '',
].join('\n'));
console.log('Prepared v' + version + ': ' + assetNames.join(', ') + ', SHA256SUMS.txt');
