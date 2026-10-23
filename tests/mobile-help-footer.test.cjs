const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('src/index.template.html','utf8');
test('phone informational footer only',()=>assert.ok(html.includes('@media (max-width: 760px) { main > .footer { display: none; } }')));
test('build version belongs to final Help metadata',()=>{assert.match(html, /class="help-build"/);assert.equal((html.match(/id="buildVersion"/g)||[]).length,1);const start=html.lastIndexOf('<dialog',html.indexOf('id="helpDialog"'));const end=html.indexOf('</dialog>',start);assert.ok(html.indexOf('id="buildVersion"')>start&&html.indexOf('id="buildVersion"')<end);});
test('canonical local badge',()=>assert.ok(html.includes("localBadge:'Fully local processing'")));
test('all metadata IDs occur once in final Help child',()=>{const start=html.lastIndexOf('<dialog',html.indexOf('id="helpDialog"'));const end=html.indexOf('</dialog>',start);const help=html.slice(start,end);for(const id of ["buildVersion"]){assert.equal(html.split('id="'+id+'"').length-1,1);assert.ok(help.includes('id="'+id+'"'));}assert.match(help,/<p class="help-build">[\s\S]*<\/p>\s*<\/div>\s*(?:<\/div>\s*)?$/);});
