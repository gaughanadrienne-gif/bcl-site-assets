const test = require("node:test");
const assert = require("node:assert");
const t = require("../bcl-tools.js");

const LOC = { origin: "https://www.bouldercreeklocal.com", protocol: "https:", host: "www.bouldercreeklocal.com", pathname: "/events" };

test("shareCleanTitle drops the site suffix and the Squarespace (Copy) tag", () => {
  assert.strictEqual(t.shareCleanTitle("Mountain Status | Boulder Creek Local"), "Mountain Status");
  assert.strictEqual(t.shareCleanTitle("The Last Train Out of Boulder Creek: January 26, 1934 "), "The Last Train Out of Boulder Creek: January 26, 1934");
  assert.strictEqual(t.shareCleanTitle("Rain — Boulder Creek Local"), "Rain");
  assert.strictEqual(t.shareCleanTitle("Draft post (Copy)"), "Draft post");
  assert.strictEqual(t.shareCleanTitle(null), "");
});

test("shareCanonicalUrl uses the site canonical and strips query and hash", () => {
  assert.strictEqual(t.shareCanonicalUrl("https://www.bouldercreeklocal.com/events?q=music#x", LOC), "https://www.bouldercreeklocal.com/events");
});

test("shareCanonicalUrl ignores a canonical pointing at another site", () => {
  assert.strictEqual(t.shareCanonicalUrl("https://evil.example/events", LOC), "https://www.bouldercreeklocal.com/events");
  assert.strictEqual(t.shareCanonicalUrl("", LOC), "https://www.bouldercreeklocal.com/events");
});

test("shareLinks encodes the URL for Facebook and the title and URL for email", () => {
  const url = "https://www.bouldercreeklocal.com/around-town/last-train-boulder-creek";
  const l = t.shareLinks(url, "Trains & Tunnels");
  assert.strictEqual(l.facebook, "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url));
  assert.ok(l.email.startsWith("mailto:?subject=Trains%20%26%20Tunnels&body="));
  const body = decodeURIComponent(l.email.split("&body=")[1]);
  assert.ok(body.includes(url));
  assert.ok(body.includes("Trains & Tunnels"));
});

test("shareBarHTML escapes attributes and shows the native button only when asked", () => {
  const plain = t.shareBarHTML("bcl-share-page", "https://www.bouldercreeklocal.com/rain", 'Rain "tracker"', {});
  assert.ok(!plain.includes('data-share="native"'));
  assert.ok(plain.includes('class="bcl-share-label"'));
  assert.ok(plain.includes("&amp;body="), "ampersand in mailto href must be escaped");
  assert.ok(!plain.includes('"tracker"'), "raw quotes must not break the attribute");
  const phone = t.shareBarHTML("bcl-share-page", "https://www.bouldercreeklocal.com/rain", "Rain", { native: true });
  assert.ok(phone.includes('data-share="native"'));
  for (const m of ["facebook", "email"]) assert.ok(phone.includes('data-share="' + m + '"'));
  assert.ok(!phone.includes('data-share="copy"'), "the system sheet covers copy on phones");
  assert.ok(plain.includes('data-share="copy"'));
});

test("share copy carries no em dashes or emoji (brand rules)", () => {
  const html = t.shareBarHTML("x", "https://www.bouldercreeklocal.com/", "T", { native: true }) + t.shareLinks("u", "T").email;
  assert.ok(!/—/.test(decodeURIComponent(html.replace(/%(?![0-9A-F]{2})/g, ""))));
  assert.ok(!/\p{Extended_Pictographic}/u.test(html));
});
