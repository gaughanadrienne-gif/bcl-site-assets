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
  assert.deepEqual(out, ["Plumbing & HVAC", "Lodging", "Event Venues", "Zzz Unknown"]);
});
test("groupLabelOf: maps categories to their group", () => {
  assert.equal(t.groupLabelOf("Event Venues"), "Weddings & Celebrations");
  assert.equal(t.groupLabelOf("Plumbing & HVAC"), "Home & Property");
  assert.equal(t.groupLabelOf("Vineyards & Wine Tasting"), "Food & Drink");
  assert.equal(t.groupLabelOf("Totally Unknown"), null);
});
test("buildDirectoryHTML: group label, local-first, divider, cap", () => {
  const rows = [
    { name: "SC DJ", category: "Wedding Services", locality: "Santa Cruz" },
    { name: "BC DJ", category: "Wedding Services", locality: "Boulder Creek" },
    { name: "Aptos DJ", category: "Wedding Services", locality: "Aptos" },
  ];
  const html = t.buildDirectoryHTML(rows, { cap: 1 });
  assert.match(html, /Weddings &amp; Celebrations/);                 // group label rendered (escaped)
  assert.ok(html.indexOf("BC DJ") < html.indexOf("Also serving the area")); // local above divider
  assert.ok(html.indexOf("Also serving the area") < html.indexOf("SC DJ")); // nearby below divider
  assert.equal(html.indexOf("Aptos DJ"), -1);                        // capped out (cap 1, SC ranks closer)
});
test("buildCategoryOptions: alphabetical options", () => {
  const opts = t.buildCategoryOptions(["Lodging", "Event Venues"]);
  assert.ok(opts.indexOf("Event Venues") < opts.indexOf("Lodging"));
});
test("buildDirectoryHTML: essential (cap-exempt) categories are never capped", () => {
  const rows = [];
  for (let i = 0; i < 8; i++) rows.push({ name: "Svc " + i, category: "Emergency & Public Safety", locality: "Santa Cruz County" });
  const html = t.buildDirectoryHTML(rows, { cap: 6 });
  for (let i = 0; i < 8; i++) assert.ok(html.indexOf("Svc " + i) >= 0, "exempt category dropped Svc " + i);
});
test("buildDirectoryHTML: non-exempt categories still cap the nearby tier", () => {
  const rows = [];
  for (let i = 0; i < 8; i++) rows.push({ name: "Vendor " + i, category: "Wedding Services", locality: "Santa Cruz" });
  const html = t.buildDirectoryHTML(rows, { cap: 6 });
  const shown = [0,1,2,3,4,5,6,7].filter((i) => html.indexOf("Vendor " + i) >= 0).length;
  assert.equal(shown, 6);
});
test("CAP_EXEMPT is exported and includes Emergency & Public Safety", () => {
  assert.ok(Array.isArray(t.CAP_EXEMPT));
  assert.ok(t.CAP_EXEMPT.indexOf("Emergency & Public Safety") >= 0);
});
test("buildDirectoryHTML: no divider or empty grid when a category has no local rows", () => {
  const rows = [
    { name: "CountyA", category: "Government & Public Services", locality: "Santa Cruz" },
    { name: "CountyB", category: "Government & Public Services", locality: "Watsonville" },
  ];
  const html = t.buildDirectoryHTML(rows, { cap: 6 });
  assert.equal(html.indexOf("Also serving the area"), -1);           // no divider without a local tier
  assert.ok(html.indexOf("CountyA") >= 0 && html.indexOf("CountyB") >= 0); // nearby still rendered
  assert.equal(/<div class="bcl-dir-grid"><\/div>/.test(html), false);     // no empty grid
});
