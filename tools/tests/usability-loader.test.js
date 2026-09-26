"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("directory and rentals load the optional usability module", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "bcl-tools.js"), "utf8");
  const selector = /querySelector\('([^']+)'\)\) extraModules\.push\('bcl-usability\.js'\)/.exec(source);
  assert.ok(selector, "optional usability loader exists");
  const roots = selector[1].split(",");
  for (const root of ["#bcl-downloads", "#bcl-give-back", "#bcl-jobs", "#bcl-directory", "#bcl-rentals"]) {
    assert.ok(roots.includes(root), `${root} loads bcl-usability.js`);
  }
});
