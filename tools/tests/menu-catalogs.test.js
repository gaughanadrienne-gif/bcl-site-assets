"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const data = require(path.join(__dirname, "../../data/articles.json"));

function menuOf(slug) {
  const html = data.articles[slug].html;
  const start = html.indexOf("<!-- bcl-menu:start -->");
  const end = html.indexOf("<!-- bcl-menu:end -->", start);
  assert.ok(start >= 0 && end > start, `${slug} should contain one marked menu`);
  return html.slice(start, end);
}

const expectedOfferings = {
  "bellas-cafe-boulder-creek": 17,
  "el-rey-leon-boulder-creek": 32,
  "elevated-wellness-massage-boulder-creek": 11,
  "lone-wolf-kenpo-boulder-creek": 8,
  "mountain-sangha-boulder-creek": 39,
  "scopazzis-boulder-creek": 114,
  "spotlight-supernatural-beauty": 55,
  "taes-edo-sushi-boulder-creek": 66,
  "taqueria-los-gallos-boulder-creek": 43,
  "tree-house-cafe-boulder-creek": 74,
  "treetop-pilates-boulder-creek": 17
};

test("updated article catalogs retain every source-backed offering", () => {
  Object.entries(expectedOfferings).forEach(([slug, expected]) => {
    const menu = menuOf(slug);
    assert.equal(
      (menu.match(/<li class="bcl-menu__item">/g) || []).length,
      expected,
      `${slug} offering count`
    );
    assert.equal(menu.includes("bcl-menu-item"), false, `${slug} should use canonical BEM markup`);
  });
});

test("large catalogs use native disclosure while shorter catalogs stay open", () => {
  const disclosureCounts = {
    "el-rey-leon-boulder-creek": 8,
    "mountain-sangha-boulder-creek": 7,
    "scopazzis-boulder-creek": 8,
    "spotlight-supernatural-beauty": 10,
    "taes-edo-sushi-boulder-creek": 9,
    "taqueria-los-gallos-boulder-creek": 8,
    "tree-house-cafe-boulder-creek": 8
  };
  Object.entries(disclosureCounts).forEach(([slug, expected]) => {
    assert.equal(
      (menuOf(slug).match(/<details class="bcl-menu__group"/g) || []).length,
      expected,
      `${slug} disclosure count`
    );
  });
  [
    "bellas-cafe-boulder-creek",
    "elevated-wellness-massage-boulder-creek",
    "lone-wolf-kenpo-boulder-creek",
    "treetop-pilates-boulder-creek"
  ].forEach((slug) => assert.equal(menuOf(slug).includes("<details"), false));
});

test("source limitations are stated instead of overstating completeness or currency", () => {
  assert.match(menuOf("bellas-cafe-boulder-creek"), /Lunch runs alongside breakfast but is not captured here/);
  assert.match(menuOf("el-rey-leon-boulder-creek"), /source-limited snapshot/);
  assert.match(menuOf("taes-edo-sushi-boulder-creek"), /menu snapshot/);
  assert.match(menuOf("taqueria-los-gallos-boulder-creek"), /board snapshot/);
  assert.match(menuOf("tree-house-cafe-boulder-creek"), /menu snapshot/);
  assert.match(menuOf("treetop-pilates-boulder-creek"), /updated January 2020/);
  assert.doesNotMatch(data.articles["el-rey-leon-boulder-creek"].html, /online ordering is currently unavailable/i);
  assert.doesNotMatch(menuOf("treetop-pilates-boulder-creek"), /class="bcl-menu__p/);
});

test("newly recovered offering families are present", () => {
  assert.match(menuOf("lone-wolf-kenpo-boulder-creek"), /Cardio kickboxing/);
  assert.match(menuOf("elevated-wellness-massage-boulder-creek"), /Wellness gifts/);
  assert.match(menuOf("mountain-sangha-boulder-creek"), /Private sessions and rentals/);
  assert.match(menuOf("scopazzis-boulder-creek"), /Harris Ranch Ribeye/);
  assert.match(menuOf("tree-house-cafe-boulder-creek"), /Build Your Own Sandwich/);
  assert.match(menuOf("taes-edo-sushi-boulder-creek"), /Spicy Scallop Roll/);
  assert.match(menuOf("treetop-pilates-boulder-creek"), /Duet, ten-pack/);
});
