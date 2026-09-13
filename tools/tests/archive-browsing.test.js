const test = require('node:test');
const assert = require('node:assert/strict');
const a = require('../bcl-archive');
const item = (slug, overrides={}) => ({title:slug, fullUrl:'/around-town/'+slug, publishOn:Date.now()-10000, workflowState:1, categories:['Food'], excerpt:'<p>Coffee &amp; neighbors</p>', ...overrides});
test('archive route guard excludes article and unrelated pages', () => {
  for (const path of ['/around-town','/around-town/','/around-town/category/Town+%26+History']) assert.equal(a.archivePath(path),true);
  for (const path of ['/around-town/a-story','/jobs','/around-town/category/a/b']) assert.equal(a.archivePath(path),false);
});
test('public eligibility rejects drafts, future dates and external URLs', () => {
  assert.equal(a.publicItem(item('one'),Date.now()),true);
  for (const changes of [{workflowState:2},{publishOn:Date.now()+5000},{fullUrl:'https://evil.test/x'},{fullUrl:'/jobs'},{publishOn:null}]) assert.equal(Boolean(a.publicItem(item('one',changes),Date.now())),false);
});
test('query matches all words across title summary and category', () => {
  const rows=[item('Jenna Sue'),item('Railroad',{categories:['History'],excerpt:'Steam trains'})];
  assert.equal(a.matching(rows,'COFFEE jenna','Food').length,1);
  assert.equal(a.matching(rows,'coffee','History').length,0);
  assert.equal(a.matching(rows,'railroad trains','').length,1);
});
test('category URLs encode labels and preserve native navigation', () => {
  assert.equal(a.categoryURL('Town & History'),'/around-town/category/Town+%26+History');
  assert.equal(a.categoryURL(''),'/around-town');
});
test('archive loads every public page and deduplicates overlap', async () => {
  const calls=[];
  const results=await a.loadArchive(async(url,opts)=>{
    calls.push(url); assert.equal(opts.credentials,'omit');
    return {ok:true,json:async()=>calls.length===1?{items:[item('first')],pagination:{nextPage:true,nextPageOffset:'123'}}:{items:[item('first'),item('second'),item('draft',{workflowState:2})],pagination:{nextPage:false}}};
  });
  assert.equal(results.length,2); assert.equal(calls[1],'/around-town?format=json&offset=123');
});
test('partial or cyclic archive never masquerades as full results', async () => {
  await assert.rejects(a.loadArchive(async()=>({ok:false})));
  await assert.rejects(a.loadArchive(async()=>({ok:true,json:async()=>({items:[item('one')],pagination:{nextPage:true,nextPageOffset:'1'}})})),/did not finish/);
  assert.throws(()=>a.nextURL({pagination:{nextPage:true,nextPageOffset:'https://evil.test'}}));
});
test('cards escape content and use public artwork only', () => {
  const html=a.card(item('x',{title:'<script>bad</script>',assetUrl:'javascript:alert(1)',excerpt:'<b>Summary</b>'}));
  assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<img')); assert.ok(html.includes('Summary'));
  assert.ok(a.card(item('x',{assetUrl:'https://images.squarespace-cdn.com/content/x.jpg'})).includes('loading="lazy"'));
});
