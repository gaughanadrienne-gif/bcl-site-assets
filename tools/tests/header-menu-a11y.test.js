"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const tools = require("../bcl-tools.js");

const SRC = fs.readFileSync(path.join(__dirname, "..", "bcl-tools.js"), "utf8");

function fakeButton() {
  return {
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; }
  };
}

test("header menu aria state preserves an existing menu id", () => {
  const button = fakeButton();
  const menu = { id: "site-navigation" };
  tools.setHeaderMenuA11y(button, menu, true);
  assert.equal(menu.id, "site-navigation");
  assert.equal(button.attributes["aria-controls"], "site-navigation");
  assert.equal(button.attributes["aria-expanded"], "true");
  tools.setHeaderMenuA11y(button, menu, false);
  assert.equal(button.attributes["aria-expanded"], "false");
});

test("header menu aria state assigns a stable fallback id", () => {
  const button = fakeButton();
  const menu = { id: "" };
  tools.setHeaderMenuA11y(button, menu, false);
  assert.equal(menu.id, "bcl-mobile-menu");
  assert.equal(button.attributes["aria-controls"], "bcl-mobile-menu");
});

test("header enhancement mirrors native state without owning the toggle", () => {
  const start = SRC.indexOf("function initHeaderMenuA11y()");
  const end = SRC.indexOf("/* ---------- article header", start);
  const code = SRC.slice(start, end);
  assert.match(SRC, /document\.body\.classList\.contains\("header--menu-open"\)/);
  assert.match(SRC, /classList\.contains\("burger--active"\)/);
  assert.match(code, /new MutationObserver\(sync\)/);
  assert.match(code, /requestAnimationFrame\(sync\)/);
  assert.doesNotMatch(code, /preventDefault|classList\.toggle|\.click\(\)/);
  assert.match(SRC, /injectCSS\(\);\s+initHeaderMenuA11y\(\);/);
});

test("native mobile header motion and target size are bounded", () => {
  assert.match(SRC, /\.header-burger-btn\{box-sizing:border-box;min-width:44px!important;min-height:44px!important;\}/);
  assert.match(SRC, /transition-duration:\.22s!important/);
  assert.match(SRC, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(SRC, /transition-duration:\.01ms!important/);
  assert.match(SRC, /\.header-burger-btn:focus-visible\{outline:3px solid #d56e47/);
});
