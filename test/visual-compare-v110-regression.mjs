import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/index.template.html', import.meta.url), 'utf8');
const built = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');

for (const id of [
  'compareFromBranchSelect','compareFromSelect','compareToBranchSelect','compareToSelect','compareSwapButton',
  'compareFilterList','compareChangedOnlyButton','compareSlideList','visualCompare','visualSideGrid','visualLayered',
  'visualSplitHandle','visualBlinkToggle','visualMarkerToggle','visualSemanticList','visualNotesPanel','workingCompareButton'
]) {
  if (!source.includes(`id="${id}"`)) throw new Error(`v1.1.0 control missing: ${id}`);
}
for (const mode of ['side','overlay','split','blink']) {
  if (!source.includes(`data-visual-mode="${mode}"`)) throw new Error(`visual mode missing: ${mode}`);
}
for (const needle of [
  "tabDiff:'比較'",
  "tabDiff:'Compare'",
  "function showWorkingVisualCompare()",
  "function renderVisualCompare()",
  "function renderMarkerLayer(root,pair,side)",
  "function focusVisualMarker(id)",
  "to.style.clipPath=`inset(0 ${100-state.visualSplit}% 0 0)`",
  "matchMedia('(prefers-reduced-motion: reduce)').matches",
  "if(marker.category==='notes')continue",
  "state.visualBlinkTimer=setInterval",
  "visualBlinkPaused",
  "@media(max-width:760px){.repo-form{grid-template-columns:1fr}",
  ".visual-side-grid{grid-template-columns:1fr}",
  ".visual-mobile-nav{position:sticky",
  "connect-src 'none'"
]) {
  if (!source.includes(needle) && !built.includes(needle)) throw new Error(`v1.1.0 behavior marker missing: ${needle}`);
}
if (/data-i18n="filter(?:Text|Number|Object|Image|Layout|Formatting|Notes)"/.test(source)) throw new Error('undefined filter translation key remains');
if (source.includes("{text:'filterText'")) throw new Error('undefined visual marker translation map remains');
if (!built.includes('v1.1.2')) throw new Error('built version badge is not v1.1.2');
if (built.includes('__APP_CONFIG_JSON__') || built.includes('__BUILD_MANIFEST_JSON__') || built.includes('__EMBEDDED_ASSET_BUNDLE_JSON__') || built.includes('__APP_ICON_DATA_URI__')) throw new Error('build placeholders remain');
console.log('ok: v1.1.0 Visual Compare controls, modes, marker linkage, mobile CSS, translations, and CSP');
