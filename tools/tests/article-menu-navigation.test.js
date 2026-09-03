"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const tools = require("../bcl-tools.js");

const SRC = fs.readFileSync(path.join(__dirname, "..", "bcl-tools.js"), "utf8");

function menuWithTitle(title) {
  return { querySelector: () => ({ textContent: title }) };
}

test("article menu jump labels follow the catalog's role", () => {
  assert.equal(tools.articleMenuJumpLabel(menuWithTitle("The full menu")), "Jump to menu");
  assert.equal(tools.articleMenuJumpLabel(menuWithTitle("Services and booking")), "Jump to services");
  assert.equal(tools.articleMenuJumpLabel(menuWithTitle("Classes and packages")), "Jump to offerings");
});

test("menu navigation preserves authored jumps and generates only the missing path", () => {
  const start = SRC.indexOf("function initArticleMenuNavigation(root)");
  const end = SRC.indexOf("function pageHeadingForPath", start);
  const code = SRC.slice(start, end);
  assert.match(code, /if \(host\.querySelector\("\.bcl-article-jump"\)\) return/);
  assert.match(code, /jump\.className = "bcl-article-jump"/);
  assert.match(code, /data-bcl-generated-menu-jump/);
  assert.match(code, /firstParagraph\.parentNode\.insertBefore\(jump, firstParagraph\.nextSibling\)/);
});

test("menu navigation gives every menu a collision-safe id and runs for native and injected bodies", () => {
  assert.match(SRC, /var menus = \[\]\.slice\.call\(host\.querySelectorAll\("\.bcl-menu"\)\)/);
  assert.match(SRC, /while \(document\.getElementById\(id\).*id = base \+ "-" \+ suffix\+\+/);
  assert.match(SRC, /target\.appendChild\(body\);\s+initArticleMenuNavigation\(target\);/);
  assert.match(SRC, /initArticleContent\(\);\s+initArticleMenuNavigation\(\);/);
});
