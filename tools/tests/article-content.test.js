"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const tools = require("../bcl-tools.js");

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