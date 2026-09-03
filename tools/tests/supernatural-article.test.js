"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const data = require(path.join(__dirname, "../../data/articles.json"));

const record = data.articles["spotlight-supernatural-beauty"];
const html = record.html;

test("the SuperNatural service module is part of At a glance", () => {
  assert.equal((html.match(/<!-- bcl-menu:start -->/g) || []).length, 1);
  assert.equal((html.match(/<!-- bcl-menu:end -->/g) || []).length, 1);
  assert.ok(html.indexOf("<h2>SuperNatural Beauty at a glance</h2>") < html.indexOf("<!-- bcl-menu:start -->"));
  assert.ok(html.indexOf("<!-- bcl-menu:start -->") < html.indexOf("<h2>The Boulder Creek Questions</h2>"));
  assert.equal(html.includes("SuperNatural Beauty's published services include"), false);
});

test("the article has one intentional pull quote", () => {
  assert.equal((html.match(/<blockquote/g) || []).length, 3);
  assert.equal((html.match(/class="bcl-pullquote"/g) || []).length, 1);
  const featured = html.slice(html.indexOf('<blockquote class="bcl-pullquote">'), html.indexOf("</blockquote>", html.indexOf('<blockquote class="bcl-pullquote">')));
  assert.match(featured, /The hospital is where I help people survive/);
});

test("the service module provides a direct, non-duplicative booking path", () => {
  assert.equal((html.match(/id="services-and-booking"/g) || []).length, 1);
  assert.equal((html.match(/https:\/\/booking\.mangomint\.com\/208749/g) || []).length, 1);
  assert.equal(html.includes('href="/around-town/spotlight-supernatural-beauty"'), false);
  assert.match(html, /class="bcl-article-jump"/);
  assert.equal(record.headerImage, "brand/article-headers/spotlight-supernatural-beauty.webp");
  assert.equal(record.imageAlt, "Watercolor illustration of the SuperNatural Beauty storefront in Boulder Creek");
});
