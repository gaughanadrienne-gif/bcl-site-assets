"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const data = require(path.join(__dirname, "../../data/articles.json"));

const record = data.articles["spotlight-supernatural-beauty"];
const html = record.html;

test("the SuperNatural service module replaces the separate At a glance block", () => {
  assert.equal((html.match(/<!-- bcl-menu:start -->/g) || []).length, 1);
  assert.equal((html.match(/<!-- bcl-menu:end -->/g) || []).length, 1);
  assert.equal(html.includes("<h2>SuperNatural Beauty at a glance</h2>"), false);
  assert.equal(html.includes("<h2 class=\"bcl-menu__title\">Services &amp; booking</h2>"), true);
  assert.ok(html.indexOf("<!-- bcl-menu:start -->") < html.indexOf("<h2>The Boulder Creek Questions</h2>"));
  assert.equal(html.includes("SuperNatural Beauty's published services include"), false);
});

test("the article has one pull quote and two readable supporting interview quotes", () => {
  assert.equal((html.match(/<blockquote/g) || []).length, 3);
  assert.equal((html.match(/class="bcl-pullquote"/g) || []).length, 1);
  assert.equal((html.match(/class="bcl-interview-quote"/g) || []).length, 2);
  const featured = html.slice(html.indexOf('<blockquote class="bcl-pullquote">'), html.indexOf("</blockquote>", html.indexOf('<blockquote class="bcl-pullquote">')));
  assert.match(featured, /The hospital is where I help people survive/);
});

test("the service module is complete, compact and price-free", () => {
  const start = html.indexOf("<!-- bcl-menu:start -->");
  const end = html.indexOf("<!-- bcl-menu:end -->", start);
  const menu = html.slice(start, end);

  assert.equal((html.match(/id="services-and-booking"/g) || []).length, 1);
  assert.equal((html.match(/https:\/\/booking\.mangomint\.com\/208749/g) || []).length, 1);
  assert.equal(html.includes('href="/around-town/spotlight-supernatural-beauty"'), false);
  assert.match(html, /class="bcl-article-jump"/);
  assert.equal((menu.match(/<details class="bcl-menu__group"/g) || []).length, 10);
  assert.equal((menu.match(/<details class="bcl-menu__group" open>/g) || []).length, 1);
  assert.match(menu, /<details class="bcl-menu__group" open>[\s\S]*?<h3 class="bcl-menu__sech">IV infusions<\/h3>/);
  assert.equal((menu.match(/<li class="bcl-menu__item">/g) || []).length, 55);
  assert.equal((menu.match(/class="bcl-menu__p(?:\s[^"]*)?"/g) || []).length, 0);
  assert.equal(menu.includes("No prices are published"), false);
  assert.match(menu, /Liquilift Vitamin Pack/);
  assert.match(menu, /NAD \(500mg\) &amp; Hydration/);
  assert.match(menu, /Medical-grade skincare/);
  assert.match(menu, /Wellness technology/);
  assert.match(menu, /https:\/\/supernatural\.beauty\/services\//);
  assert.ok(menu.indexOf("bcl-menu__actions") < menu.indexOf("<details"));
  assert.equal(record.imageAlt, "Watercolor illustration of the SuperNatural Beauty storefront in Boulder Creek");
});
