const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const main=fs.readFileSync(path.join(root,'tools/bcl-tools.js'),'utf8');
const source=fs.readFileSync(path.join(root,'tools/bcl-usability.js'),'utf8');
const archive=fs.readFileSync(path.join(root,'tools/bcl-archive.js'),'utf8');
test('optional code modules resolve against immutable executing script, not data alias',()=>{
 assert.match(main,/document\.currentScript\.src/);assert.match(main,/new URL\(name, BCL_CODE_URL\)/);
 assert.match(source,/new URL\('\.\.\/', script\.src\)/);
});
test('preview metadata matches the complete published PDF library and PNG renders',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'downloads/previews/manifest.json')));
 assert.deepEqual(Object.keys(manifest).sort(),fs.readdirSync(path.join(root,'downloads')).filter(name=>name.endsWith('.pdf')).sort());
 for(const [name,item] of Object.entries(manifest)){
  const bytes=fs.readFileSync(path.join(root,'downloads',name));
  assert.equal(bytes.length,item.bytes);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),item.sha256);
  assert.ok(Number.isInteger(item.pages) && item.pages >= 1);
  assert.equal(fs.readFileSync(path.join(root,item.preview)).subarray(1,4).toString(),'PNG');
 }
});
test('Give Back batch visibility is separate from native filter eligibility',()=>{
 assert.match(source,/return !card\.hidden/);assert.match(source,/classList\.toggle\('bcl-batch-hidden'/);
 assert.doesNotMatch(source,/card\.hidden\s*=/);
 assert.match(source,/limit=12;apply\(\)/);assert.match(source,/hashchange/);
});
test('archive pending search hides Load more before asynchronous work',()=>{
 const start=archive.indexOf('function search()');
 const pending=archive.slice(start,archive.indexOf("controls.querySelector('form')",start));
 assert.ok(pending.indexOf('more.hidden = true')<pending.indexOf('loading.then'));
 assert.match(archive,/if \(target\) target\.focus\(\)/);
});
test('navigation runs for initial native pages and after asynchronous rain rendering',()=>{
 assert.equal((main.match(/initBclSectionJumps\(\);/g)||[]).length,2);
 assert.match(main,/bcl-section-jump-target\{scroll-margin-top:120px/);
});
