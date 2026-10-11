const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const removed = [
  "ダイアログを開いている間は背景ページのスクロールが止まります。長い内容はダイアログ内でスクロールできます。画面が低い場合は競合解決画面全体をスクロールして、選択・手動編集・解決内容の確認へ進めます。「閉じる」は常に表示されます。",
  "The background page stops scrolling while a dialog is open. Scroll inside the dialog to read longer content. On short screens, scroll through the conflict resolver to reach choices, manual editing and Continue. Close stays visible.",
  "閉じた詳細が遅れた読み込みで再表示されることはありません。",
  " A delayed read will not reopen closed details."
];
for (const file of ["src/index.template.html", "pptx-version-control.html"]) {
  test(`${file}: user help omits implementation commentary`, () => {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    for (const text of removed) assert.ok(!html.includes(text), `Remove implementation copy from ${file}`);
  });
}
