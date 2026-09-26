const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'tools/bcl-usability.js'), 'utf8');
const body = source.slice(source.indexOf('  function guideLinks()'), source.indexOf('  function downloads()'));
function fixture(ids) {
  const nodes = {};
  function element(tag) { return {tag, children:[], setAttribute(k,v){this[k]=v;}, appendChild(x){this.children.push(x); if(x.id)nodes[x.id]=x;}, before(x){nodes[x.id]=x;}, querySelector(){return null;}}; }
  ids.forEach(id=>{nodes[id]=element('div');});
  const document={getElementById:id=>nodes[id]||null,createElement:element};
  const context={document,URL}; vm.createContext(context);vm.runInContext(body+'\nguideLinks();',context);
  return {nodes,context};
}
test('guide navigation mounts once, only beside the matching live tool',()=>{
  const {nodes,context}=fixture(['bcl-jobs']);
  assert.ok(nodes['bcl-jobs-guides']);assert.equal(nodes['bcl-rentals-guides'],undefined);
  const first=nodes['bcl-jobs-guides'];vm.runInContext('guideLinks()',context);assert.equal(nodes['bcl-jobs-guides'],first);
  assert.equal(first['aria-label'],'Plan your job search');
});
test('every article route exists and historical analyses are labeled as snapshots',()=>{
  const {nodes}=fixture(['bcl-jobs','bcl-rentals','bcl-directory']);
  const articles=JSON.parse(fs.readFileSync(path.join(root,'data/articles.json'),'utf8')).articles;
  const links=Object.values(nodes).filter(x=>x.tag==='nav').flatMap(n=>n.children[1].children.map(li=>li.children[0]));
  assert.equal(links.length,7);
  for(const link of links){
    if(link.href.startsWith('/around-town/'))assert.ok(articles[link.href.split('/').pop()],link.href);
    if(/what-jobs|what-the-directory/.test(link.href))assert.match(link.textContent,/2026 snapshot/);
  }
  assert.ok(links.some(l=>l.href==='/downloads#everyday'));
});
test('download companion links preserve the existing PDF and avoid duplicates',()=>{
  const {nodes,context}=fixture([]);
  const children=[];
  const card={querySelector:s=>s==='.bcl-download-copy'?{appendChild:l=>children.push(l)}:children.find(l=>l.className===s.slice(1))};
  const pdf={href:'https://cdn.jsdelivr.net/gh/gaughanadrienne-gif/bcl-site-assets@main/downloads/BCL_Local_Job_Search_Planner.pdf',closest:()=>card};
  nodes['bcl-downloads']={querySelectorAll:()=>[pdf]};
  vm.runInContext('guideLinks();guideLinks();',context);
  assert.equal(children.length,1);assert.equal(children[0].href,'/jobs');assert.match(pdf.href,/\.pdf$/);
});
