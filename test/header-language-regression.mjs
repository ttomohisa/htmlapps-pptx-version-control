import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import zlib from 'node:zlib';

// Execute real translations, language application and header click handlers with
// DOM/storage boundary doubles. Browser layout and native Escape remain browser QA.
const root = new URL('../', import.meta.url);
const config = JSON.parse(fs.readFileSync(new URL('app.config.json', root), 'utf8'));
const isDiff = config.slug === 'pptx-diff';
const targets = process.argv.includes('--source-only') ? ['src/index.template.html'] :
  ['src/index.template.html', 'dist/index.html', `${config.slug}.html`, 'dist/index.self-extract.html'];
function read(path) {
  const html = fs.readFileSync(new URL(path, root), 'utf8');
  if (!path.includes('self-extract')) return html;
  const payload = html.match(/<script id="self-extract-payload" type="application\/octet-stream">([\s\S]*?)<\/script>/);
  assert.ok(payload, 'local self-extract payload exists');
  return zlib.gunzipSync(Buffer.from(payload[1], 'base64')).toString('utf8');
}
function setup(html, initial, storage = new Map()) {
  const nodes = [];
  // Read the real HTML attributes rather than inventing i18n markers in the test.
  for (const [, tag, raw] of html.slice(0, html.indexOf('<script>')).matchAll(/<([a-z][\w-]*)\b([^<>]*)>/gi)) {
    const attributes = Object.fromEntries([...raw.matchAll(/([\w-]+)="([^"]*)"/g)].map(x => [x[1], x[2]]));
    const dataset = Object.fromEntries(Object.entries(attributes).filter(([k]) => k.startsWith('data-')).map(([k,v]) => [k.slice(5).replace(/-([a-z])/g, (_,c) => c.toUpperCase()),v]));
    nodes.push({tag, attributes, dataset, textContent:'', listeners:{}, open:false,
      get title() { return this.attributes.title || ''; }, set title(v) { this.attributes.title = v; },
      setAttribute(k,v) { this.attributes[k] = v; },
      addEventListener(k,f) { this.listeners[k] = f; },
      click(event = {}) { this.listeners.click?.(event); },
      showModal() { this.open = true; }, close() { this.open = false; },
      getBoundingClientRect() { return {left:10, top:10, right:100, bottom:100}; }
    });
  }
  const $ = selector => { const node = nodes.find(x => `#${x.attributes.id}` === selector); assert.ok(node, selector); return node; };
  const document = {documentElement:{lang:''}, title:'', querySelector:$,
    querySelectorAll(selector) { const attribute = selector.match(/^\[([\w-]+)\]$/)?.[1]; assert.ok(attribute, selector); return nodes.filter(n => attribute in n.attributes); }
  };
  const context = vm.createContext({document, $, APP_CONFIG:{...config, defaultLanguage:'auto'}, navigator:{language:initial},
    localStorage:{getItem:k => storage.get(k) ?? null, setItem:(k,v) => storage.set(k,v)},
    state:{language:initial, phase:'empty', models:null, model:null},
    renderFileSlot(){}, updateReadyState(){}, renderLocalProjects(){}, renderRepositoryPanel(){}, renderHistory(){},
    renderCompareControls(){}, renderCheckoutBanner(){}, renderBranchPicker(){}, renderBranches(){}, renderMerge(){}, renderDiff(){}, setStatus(){}
  });
  const functionCode = name => {
    const marker = new RegExp(`^${isDiff ? '      ' : ''}function ${name}\\(`, 'm');
    const start = html.search(marker); assert.notEqual(start, -1, name);
    const end = html.indexOf('\n', start), line = html.slice(start, end);
    return isDiff && !line.trimEnd().endsWith('}') ? html.slice(start, html.indexOf('\n      }', end) + 8) : line;
  };
  const translationStart = html.indexOf(isDiff ? '      const translations = {' : 'const translations={');
  const translationEnd = html.indexOf(isDiff ? '\n      // Template repository contract' : '\nconst $=', translationStart);
  assert.ok(translationStart >= 0 && translationEnd > translationStart);
  const languageStart = html.indexOf("$('#languageButton').addEventListener('click'");
  const languageEnd = html.indexOf("$('#versionBadge').textContent=", languageStart);
  assert.ok(languageStart >= 0 && languageEnd > languageStart);
  vm.runInContext(html.slice(translationStart, translationEnd) + '\n' +
    (isDiff ? functionCode('detectLanguage') + '\nstate.language=detectLanguage();' : functionCode('readStorage') + '\n' + functionCode('detectLanguage') + '\nlet language=readStorage(`${APP_CONFIG.slug}:language`)||detectLanguage();') + '\n' +
    (isDiff ? functionCode('t') : '') + '\n' + functionCode('applyLanguage') + '\n' + html.slice(languageStart, languageEnd) + '\napplyLanguage();', context);
  return {$, document, nodes, storage};
}
for (const path of targets) {
  const html = read(path);
  test(`${path}: language buttons use EN and JA through repeated switches and reload`, () => {
    for (const initial of ['ja','en']) {
      const h = setup(html, initial);
      for (let i=0; i<4; i++) {
        const language = i % 2 ? (initial === 'ja' ? 'en' : 'ja') : initial;
        assert.equal(h.document.documentElement.lang, language);
        assert.equal(h.$('#languageButton').textContent, language === 'ja' ? 'EN' : 'JA');
        h.$('#languageButton').click();
      }
      h.$('#languageButton').click();
      const restored = setup(html, initial, h.storage);
      assert.equal(restored.document.documentElement.lang, initial === 'ja' ? 'en' : 'ja');
      assert.equal(restored.$('#languageButton').textContent, initial === 'ja' ? 'JA' : 'EN');
    }
  });
  test(`${path}: language title and accessible name describe the target language`, () => {
    const h = setup(html, 'ja');
    for (const label of ['英語に切り替え','Switch to Japanese','英語に切り替え']) {
      assert.equal(h.$('#languageButton').attributes['aria-label'], label);
      assert.equal(h.$('#languageButton').title, label);
      h.$('#languageButton').click();
    }
  });
  test(`${path}: existing localized Help labels and open/close behavior remain intact`, () => {
    const h = setup(html, 'ja');
    for (const label of ['使い方と注意事項',isDiff ? 'How to use & notes' : 'Usage and notes','使い方と注意事項']) {
      assert.equal(h.$('#helpButton').attributes['aria-label'], label);
      assert.equal(h.$('#helpButton').title, label);
      assert.equal(h.nodes.find(n => n.tag === 'h2' && n.dataset.i18n === 'helpTitle').textContent, label);
      h.$('#helpButton').click(); assert.equal(h.$('#helpDialog').open, true);
      h.$('#closeHelpButton').click(); assert.equal(h.$('#helpDialog').open, false);
      h.$('#helpButton').click(); h.$('#helpDialog').click({clientX:0, clientY:0}); assert.equal(h.$('#helpDialog').open, false);
      h.$('#languageButton').click();
    }
  });
  test(`${path}: privacy wording remains local in both languages`, () => {
    const h = setup(html, 'ja');
    const badge = () => h.nodes.find(n => n.dataset.i18n === 'localBadge').textContent;
    assert.equal(badge(), '完全ローカル処理');
    h.$('#languageButton').click(); assert.equal(badge(), isDiff ? 'Fully local processing' : 'Completely local');
    h.$('#languageButton').click(); assert.equal(badge(), '完全ローカル処理');
  });
}
