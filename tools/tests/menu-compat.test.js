"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SRC = fs.readFileSync(path.join(__dirname, "..", "bcl-tools.js"), "utf8");

function sharesRule(a, b) {
  return SRC.split(/\r?\n/).some((line) => line.includes(a) && line.includes(b) && line.includes("{"));
}

test("legacy and BEM menu schemas share the visual role rules", () => {
  [
    [".bcl-menu__title", ".bcl-menu-h"],
    [".bcl-menu__sub", ".bcl-menu-sub"],
    [".bcl-menu__sech", ".bcl-menu-sec"],
    [".bcl-menu__note", ".bcl-menu-note"],
    [".bcl-menu__items", ".bcl-menu-list"],
    [".bcl-menu__item", ".bcl-menu-item"],
    [".bcl-menu__n", ".bcl-menu-name"],
    [".bcl-menu__d", ".bcl-menu-desc"],
    [".bcl-menu__p", ".bcl-menu-price"],
    [".bcl-menu__foot", ".bcl-menu-foot"]
  ].forEach(([bem, legacy]) => assert.ok(sharesRule(bem, legacy), `${bem} and ${legacy} should share a rule`));
});

test("legacy restaurant rows retain wrapping while BEM rows retain their structure", () => {
  assert.match(SRC, /\.bcl-menu__item\{display:flex;gap:14px;\}/);
  assert.match(SRC, /\.bcl-menu-item\{display:flex;flex-wrap:wrap;gap:4px 14px;\}/);
  assert.match(SRC, /\.bcl-menu-name\{flex:1 1 60%;\}/);
  assert.match(SRC, /\.bcl-menu-desc\{flex:1 1 100%;/);
});

test("large-menu disclosure uses native details and keeps the first section open", () => {
  assert.match(SRC, /document\.createElement\("details"\)/);
  assert.match(SRC, /document\.createElement\("summary"\)/);
  assert.match(SRC, /sections\.length < 6 && itemCount < 30/);
  assert.match(SRC, /if \(index === 0\) details\.open = true/);
  assert.match(SRC, /\.bcl-menu__group\[open\]>/);
  assert.match(SRC, /querySelectorAll\("\.bcl-menu-item"\)\.length/);
  assert.doesNotMatch(SRC, /querySelectorAll\("\[class\*=['"]bcl-menu-item/);
});
