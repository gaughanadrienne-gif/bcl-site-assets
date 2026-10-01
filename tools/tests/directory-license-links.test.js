"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const t = require("../bcl-tools.js");
const url = n => "https://www.cslb.ca.gov/OnlineServices/CheckLicenseII/LicenseDetail.aspx?LicNum=" + n;
test("official CSLB records preserve the business website and support two licenses", () => {
  const card = t.listingCard({ name: "GutterPatrol & WindowShine", website: "https://www.gutterpatrol.com/", license: "CSLB #1055861 (active, C-43); CSLB #1145742 (active, C-61/D-38)", verified_at: "2026-10-01", license_links: [{label:"CSLB #1055861",url:url("1055861")},{label:"CSLB #1145742",url:url("1145742")}] });
  assert.ok(card.includes('href="https://www.gutterpatrol.com/"'));
  assert.ok(card.includes('href="'+url("1055861")+'"'));
  assert.ok(card.includes('href="'+url("1145742")+'"'));
  assert.ok(card.includes("active, C-61/D-38"));
  assert.ok(card.includes("Last verified Oct 2026"));
  assert.ok(!card.includes("1145741"));
});
test("missing or malformed optional fields retain the legacy card", () => {
  const listing = {name:"Legacy contractor",license:"CSLB #123456 (active, B)"};
  const legacy = t.listingCard(listing);
  for (const license_links of [undefined,null,{},"bad",[]]) assert.equal(t.listingCard({...listing,license_links}),legacy);
});
test("official links reject foreign hosts, scripts, query additions and malformed records", () => {
  const listing={name:"Safe contractor"};
  const links=[null,{}, {url:123}, {url:"javascript:alert(1)"}, {url:"https://www.cslb.ca.gov.evil.test/OnlineServices/CheckLicenseII/LicenseDetail.aspx?LicNum=1063710"}, {url:url("1063710")+"&next=evil"}, {url:url("bad")}];
  assert.equal(t.listingCard({...listing,license_links:links}),t.listingCard(listing));
});
test("official link labels and listing names remain HTML escaped", () => {
  const card=t.listingCard({name:'<script>alert(1)</script>',license_links:[{url:url("1063710"),label:'<img src=x onerror=alert(1)>'}]});
  assert.ok(!card.includes("<script>")); assert.ok(!card.includes("<img src=x"));
  assert.ok(card.includes("&lt;img")); assert.ok(card.includes('target="_blank" rel="noopener"'));
});
test("official records provide a readable default label", () => {
  const card=t.listingCard({name:"Example",license_links:[{url:url("1063710")}]});
  assert.ok(card.includes(">CSLB record</a>"));
});
