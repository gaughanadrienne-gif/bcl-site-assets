const test = require("node:test");
const assert = require("node:assert");
const t = require("../bcl-tools.js");

test("isLocal: SLV localities are local", () => {
  assert.equal(t.isLocal({ locality: "Boulder Creek" }), true);
  assert.equal(t.isLocal({ locality: "Scotts Valley" }), true);
  assert.equal(t.isLocal({ locality: "Felton" }), true);
});
test("isLocal: outside localities are not local", () => {
  assert.equal(t.isLocal({ locality: "Santa Cruz" }), false);
  assert.equal(t.isLocal({ locality: "San Jose" }), false);
});
test("isLocal: name in LOCAL_EXCEPTIONS overrides a non-local locality", () => {
  assert.equal(t.isLocal({ locality: "Los Gatos", name: "Byington Vineyard & Winery" }), true);
});
test("isLocal: explicit local flag wins", () => {
  assert.equal(t.isLocal({ locality: "Santa Cruz", local: true }), true);
});
test("localityRank: closer localities rank lower than farther ones", () => {
  assert.ok(t.localityRank({ locality: "Boulder Creek" }) < t.localityRank({ locality: "Felton" }));
  assert.ok(t.localityRank({ locality: "Felton" }) < t.localityRank({ locality: "Santa Cruz" }));
  assert.equal(t.localityRank({ locality: "Nowhereville" }), Infinity);
});
