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
  assert.match(SRC, /classList\.contains\("header--menu-open"\)/);
  assert.match(SRC, /classList\.contains\("burger--active"\)/);
  assert.match(code, /new MutationObserver\(sync\)/);
  assert.match(code, /requestAnimationFrame\(sync\)/);
  assert.doesNotMatch(code, /classList\.toggle|\.click\(\)/);
  assert.match(SRC, /injectCSS\(\);\s+initHeaderMenuA11y\(\);/);
});

function focusable(name, rect) {
  return {
    name,
    disabled: false,
    focused: false,
    getAttribute() { return null; },
    getBoundingClientRect() { return rect; },
    focus() { this.focused = true; }
  };
}

test("open mobile menu traps Tab among the visible burger and current folder panel", () => {
  const burger = focusable("burger", {left: 340, right: 384, width: 44, height: 44});
  burger.classList = { contains(name) { return name === "burger--active"; } };
  burger.closest = () => null;
  const current = focusable("current", {left: 12, right: 180, width: 168, height: 30});
  const belowFold = focusable("below", {left: 12, right: 180, top: 900, width: 168, height: 30});
  const siblingPanel = focusable("sibling", {left: 430, right: 610, width: 180, height: 30});
  const doc = {
    activeElement: belowFold,
    defaultView: {innerWidth: 390, getComputedStyle() { return {display: "block", visibility: "visible"}; }},
    querySelector() { return null; }
  };
  const menu = {
    ownerDocument: doc,
    contains(node) { return node !== burger; },
    getBoundingClientRect() { return {left: 0, right: 390, width: 390, height: 700}; },
    querySelectorAll() { return [current, belowFold, siblingPanel]; }
  };
  assert.deepEqual(tools.headerMenuFocusables([burger], menu).map((node) => node.name), ["burger", "current", "below"]);
  let prevented = false;
  assert.equal(tools.containHeaderMenuTab({key: "Tab", shiftKey: false, preventDefault() { prevented = true; }}, [burger], menu), true);
  assert.equal(prevented, true);
  assert.equal(burger.focused, true, "Tab from the last visible menu link wraps to the burger");
});

test("mobile menu focus handler yields to the search dialog", () => {
  const burger = focusable("burger", {left: 340, right: 384, width: 44, height: 44});
  burger.classList = { contains() { return true; } };
  burger.closest = () => null;
  const doc = {activeElement: burger, querySelector() { return {}; }};
  const menu = {ownerDocument: doc};
  assert.equal(tools.containHeaderMenuTab({key: "Tab", preventDefault() { throw new Error("must not trap"); }}, [burger], menu), false);
});

test("native mobile header motion and target size are bounded", () => {
  assert.match(SRC, /\.header-burger-btn\{box-sizing:border-box;min-width:44px!important;min-height:44px!important;\}/);
  assert.match(SRC, /transition-duration:\.22s!important/);
  assert.match(SRC, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(SRC, /transition-duration:\.01ms!important/);
  assert.match(SRC, /\.header-burger-btn:focus-visible\{outline:3px solid #d56e47/);
  assert.match(SRC, /\.bcl-ics\{[^}]*min-height:44px[^}]*font-size:\.7rem/);
});
