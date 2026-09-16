const test = require('node:test');
const assert = require('node:assert/strict');
const {correctionReference} = require('../bcl-contact.js');
test('correction references round-trip names and URLs, only for the correction topic',()=>{
 const ref='Example & Co\nhttps://www.bouldercreeklocal.com/directory?q=Example';
 assert.equal(correctionReference('?topic=correction&reference='+encodeURIComponent(ref)),ref);
 assert.equal(correctionReference('?reference='+encodeURIComponent(ref)),'');
});
test('untrusted query text is bounded and control characters removed',()=>{
 assert.equal(correctionReference('?topic=correction&reference=%00Name%0Apage'),'Name\npage');
 assert.equal(correctionReference('?topic=correction&reference='+ 'x'.repeat(2000)).length,1500);
});
