const test = require("node:test");
const assert = require("node:assert");
const t = require("../bcl-tools.js");

const GROUPS = ["Weddings & Celebrations", "Home & Property", "Health & Personal"];
const groups = (html) => [...html.matchAll(/data-group="([^"]*)"/g)].map((m) => m[1]);

test("groupBucketOf: a known category resolves to its group", () => {
  assert.equal(t.groupBucketOf("Plumbing & HVAC"), "Home & Property");
  assert.equal(t.groupBucketOf("Lodging"), "Stay");
});

test("groupBucketOf: a category nobody grouped falls into Other, not undefined", () => {
  // Guards the real failure mode: someone adds a category to directory.json
  // without adding it to CAT_GROUPS, and its listings vanish from the chips.
  assert.equal(t.groupBucketOf("Sasquatch Supplies"), "Other");
});

test("every category in the live directory data has a real group, none fall to Other", () => {
  const data = require("../../data/directory.json");
  const orphans = [...new Set(data.listings.map((l) => l.category))].filter(
    (c) => t.groupBucketOf(c) === "Other"
  );
  assert.deepEqual(orphans, []);
});

test("chip counts partition the listings: every listing lands in exactly one group", () => {
  const data = require("../../data/directory.json");
  const counts = {};
  data.listings.forEach((l) => {
    const g = t.groupBucketOf(l.category);
    counts[g] = (counts[g] || 0) + 1;
  });
  const sum = Object.values(counts).reduce((a, b) => a + b, 0);
  assert.equal(sum, data.listings.length);
});

test("buildGroupChips: chips follow the resident-first group order, not the alphabet", () => {
  const html = t.buildGroupChips(GROUPS, {}, "", 0);
  // "" is the All chip. Home & Property leads because everyday needs lead.
  assert.deepEqual(groups(html), [
    "",
    "Home &amp; Property",
    "Health &amp; Personal",
    "Weddings &amp; Celebrations",
  ]);
});

test("buildGroupChips: an ungrouped bucket still renders, after the known groups", () => {
  const html = t.buildGroupChips(["Other", "Home & Property"], {}, "", 0);
  assert.deepEqual(groups(html), ["", "Home &amp; Property", "Other"]);
});

test("buildGroupChips: All is pressed when no group is active", () => {
  const html = t.buildGroupChips(GROUPS, { "Home & Property": 80 }, "", 80);
  assert.match(html, /data-group=""\s+aria-pressed="true"/);
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
});

test("buildGroupChips: exactly one chip is pressed when a group is active", () => {
  const html = t.buildGroupChips(GROUPS, { "Home & Property": 80 }, "Home & Property", 80);
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
  assert.match(html, /data-group="Home &amp; Property"\s+aria-pressed="true"/);
  assert.match(html, /data-group=""\s+aria-pressed="false"/);
});

test("buildGroupChips: counts render per group and All carries the faceted total", () => {
  const html = t.buildGroupChips(GROUPS, { "Home & Property": 80, "Health & Personal": 51 }, "", 131);
  assert.match(html, /All<b>131<\/b>/);
  assert.match(html, /Home &amp; Property<b>80<\/b>/);
  assert.match(html, /Health &amp; Personal<b>51<\/b>/);
});

test("buildGroupChips: a zero-count chip is disabled so no click can empty the page", () => {
  const html = t.buildGroupChips(GROUPS, { "Home & Property": 80 }, "", 80);
  assert.match(html, /data-group="Health &amp; Personal"[^>]*disabled/);
  assert.doesNotMatch(html, /data-group="Home &amp; Property"[^>]*disabled/);
});

test("buildGroupChips: the ACTIVE chip stays enabled at zero, or there is no way back out", () => {
  // Typing a search that matches nothing inside the active group drops its
  // facet count to 0; disabling it would strand the reader on an empty list.
  const html = t.buildGroupChips(GROUPS, {}, "Home & Property", 0);
  assert.doesNotMatch(html, /data-group="Home &amp; Property"[^>]*disabled/);
  assert.match(html, /data-group="Health &amp; Personal"[^>]*disabled/);
});

test("buildGroupChips: group names are escaped, never injected raw", () => {
  const html = t.buildGroupChips(['Odd "Group" & Co'], { 'Odd "Group" & Co': 1 }, "", 1);
  assert.doesNotMatch(html, /data-group="Odd "Group"/);
  assert.match(html, /&quot;Group&quot;/);
  assert.match(html, /&amp; Co/);
});

test("buildGroupChips: tolerates a missing counts object", () => {
  const html = t.buildGroupChips(GROUPS, null, "", 0);
  assert.match(html, /Home &amp; Property<b>0<\/b>/);
});
