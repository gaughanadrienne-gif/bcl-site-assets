"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const tools = require("../bcl-tools.js");

test("listing filter state reads a shared directory or food URL", () => {
  assert.deepEqual(
    tools.listingFilterState("?q=air+conditioning&category=Plumbing+%26+HVAC&open=1&local=1&utm_source=neighbor"),
    {q: "air conditioning", category: "Plumbing & HVAC", open: true, local: true}
  );
  assert.deepEqual(tools.listingFilterState("?open=true&local=0"), {q: "", category: "", open: false, local: false});
});

test("listing filter URL preserves unrelated parameters and the hash", () => {
  const loc = {href: "https://www.bouldercreeklocal.com/directory?utm_source=neighbor&q=old#directory-list"};
  assert.equal(
    tools.listingFilterUrl({q: "Mountain Air", category: "Home & Property", open: true, local: true}, loc),
    "/directory?utm_source=neighbor&q=Mountain+Air&category=Home+%26+Property&open=1&local=1#directory-list"
  );
});

test("reset state removes only listing filters", () => {
  const loc = {href: "https://www.bouldercreeklocal.com/food?ref=footer&q=pizza&category=Pizza&open=1&local=1#list"};
  assert.equal(tools.listingFilterUrl({}, loc), "/food?ref=footer#list");
});

test("directory and food shares resolve the current filtered URL at action time", () => {
  assert.equal(
    tools.shareUrlAtAction("https://www.bouldercreeklocal.com/directory", {
      origin: "https://www.bouldercreeklocal.com", pathname: "/directory", search: "?category=Plumbing+%26+HVAC", hash: "#list"
    }),
    "https://www.bouldercreeklocal.com/directory?category=Plumbing+%26+HVAC#list"
  );
  assert.equal(
    tools.shareUrlAtAction("https://www.bouldercreeklocal.com/around-town/example", {
      origin: "https://www.bouldercreeklocal.com", pathname: "/around-town/example", search: "?utm_source=x", hash: ""
    }),
    "https://www.bouldercreeklocal.com/around-town/example"
  );
});

test("mounted share anchors are refreshed when listing filter state changes", () => {
  function anchor(method) {
    return {
      method,
      href: "",
      getAttribute(name) { return name === "data-share" ? this.method : null; },
      setAttribute(name, value) { if (name === "href") this.href = value; }
    };
  }
  const facebook = anchor("facebook");
  const email = anchor("email");
  const mailApp = anchor("mail_app");
  const bar = {querySelectorAll() { return [facebook, email, mailApp]; }};
  const filtered = "https://www.bouldercreeklocal.com/directory?category=Plumbing+%26+HVAC&local=1#list";
  tools.updateShareBarLinks(bar, filtered, "Plumbers near Boulder Creek");
  assert.match(facebook.href, /directory%3Fcategory%3DPlumbing%2B%2526%2BHVAC%26local%3D1%23list/);
  assert.match(decodeURIComponent(email.href), /directory\?category=Plumbing\+%26\+HVAC&local=1#list/);
  assert.equal(mailApp.href, email.href);
});
