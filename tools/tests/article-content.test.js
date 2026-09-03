"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const tools = require("../bcl-tools.js");
const SRC = fs.readFileSync(path.join(__dirname, "..", "bcl-tools.js"), "utf8");

test("articleSlugFromPath only accepts an article detail route", () => {
  assert.equal(tools.articleSlugFromPath("/around-town/history-of-boulder-creek"), "history-of-boulder-creek");
  assert.equal(tools.articleSlugFromPath("/around-town/history-of-boulder-creek/"), "history-of-boulder-creek");
  assert.equal(tools.articleSlugFromPath("/around-town"), "");
  assert.equal(tools.articleSlugFromPath("/around-town/category/Town+%26+History"), "");
});

test("pageHeadingForPath supplies one meaningful heading for utility pages", () => {
  assert.equal(tools.pageHeadingForPath("/contact"), "Contact and submit");
  assert.equal(tools.pageHeadingForPath("/jobs/"), "Jobs in the San Lorenzo Valley");
  assert.equal(tools.pageHeadingForPath("/rentals"), "Rentals in the San Lorenzo Valley");
  assert.equal(tools.pageHeadingForPath("/around-town/category/Town+%26+History"), "Town & History articles");
  assert.equal(tools.pageHeadingForPath("/visit"), "");
});

test("article detail pages keep a visible semantic title", () => {
  assert.match(SRC, /function ensureArticleHeading\(title\)/);
  assert.match(SRC, /heading\.classList\.remove\("bcl-sr-only"\)/);
  assert.match(SRC, /heading\.classList\.add\("bcl-article-title"\)/);
  assert.match(SRC, /target\.classList\.add\("bcl-article-layout"\)/);
});

test("article typography ships the narrower measure and restrained heading rhythm", () => {
  assert.match(SRC, /\.bcl-article-body\{max-width:680px/);
  assert.match(SRC, /font-size:clamp\(1\.875rem,3vw,2\.5rem\)!important/);
  assert.match(SRC, /margin-top:48px!important;margin-bottom:16px!important/);
  assert.match(SRC, /width:9px;height:16px;margin-top:\.36em;background:#d56e47/);
  assert.match(SRC, /blockquote\.bcl-pullquote/);
  assert.match(SRC, /font-size:clamp\(1\.3125rem,2\.25vw,1\.5rem\)/);
  assert.match(SRC, /hero\.src = .*record\.headerImage.*REPO/);
});
