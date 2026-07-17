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
test("arrangeListings: local first, nearby capped, sorted by rank then name", () => {
  const rows = [
    { name: "Zeb", locality: "Santa Cruz" },
    { name: "Ann", locality: "Santa Cruz" },
    { name: "Bea", locality: "Boulder Creek" },
    { name: "Cal", locality: "Felton" },
    { name: "Dot", locality: "Aptos" },
    { name: "Eve", locality: "Soquel" },
  ];
  const { local, nearby } = t.arrangeListings(rows, 2);
  assert.deepEqual(local.map(x => x.name), ["Bea", "Cal"]);      // BC before Felton
  assert.deepEqual(nearby.map(x => x.name), ["Ann", "Zeb"]);     // Santa Cruz (rank) before Soquel/Aptos, cap 2, name tiebreak
});
test("arrangeListings: cap 0 means no limit", () => {
  const rows = [{ name: "A", locality: "Santa Cruz" }, { name: "B", locality: "Aptos" }, { name: "C", locality: "Soquel" }];
  assert.equal(t.arrangeListings(rows, 0).nearby.length, 3);
});
test("orderedCategoryNames: known categories follow CAT_ORDER, unknown appended alpha", () => {
  const out = t.orderedCategoryNames(["Lodging", "Event Venues", "Zzz Unknown", "Plumbing & HVAC"]);
  assert.deepEqual(out, ["Event Venues", "Plumbing & HVAC", "Lodging", "Zzz Unknown"]);
});
test("groupLabelOf: maps categories to their group", () => {
  assert.equal(t.groupLabelOf("Event Venues"), "Weddings & Celebrations");
  assert.equal(t.groupLabelOf("Plumbing & HVAC"), "Home & Property");
  assert.equal(t.groupLabelOf("Vineyards & Wine Tasting"), "Food & Drink");
  assert.equal(t.groupLabelOf("Totally Unknown"), null);
});
