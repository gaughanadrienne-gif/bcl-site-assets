const test = require("node:test");
const assert = require("node:assert");
const tools = require("../bcl-tools.js");
const directory = require("../../data/directory.json").listings;

function cards(html) {
  return (html.match(/class="bcl-dir-card"/g) || []).length;
}

test("directory preview limits the ordered result set globally, not once per category", () => {
  assert.equal(cards(tools.buildDirectoryHTML(directory, { limit: 24 })), 24);
  assert.equal(cards(tools.buildDirectoryHTML(directory, { limit: 48 })), 48);
  assert.equal(cards(tools.buildDirectoryHTML(directory, { limit: directory.length })), directory.length);
});
