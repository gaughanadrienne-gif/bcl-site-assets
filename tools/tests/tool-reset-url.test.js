"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const t = require("../bcl-tools.js");

test("Jobs Reset clears search deep-link state and preserves unrelated URL state", () => {
  const loc = {href: "https://www.bouldercreeklocal.com/jobs?utm_source=neighbor&q=Nurse&extended=1&tab=remote#board"};
  assert.equal(t.toolResetUrl("jobs", loc), "/jobs?utm_source=neighbor#board");
});

test("Events and Rentals Reset clear q without deleting unrelated parameters or hashes", () => {
  assert.equal(
    t.toolResetUrl("events", {href: "https://www.bouldercreeklocal.com/events?ref=home&q=music&view=compact#calendar"}),
    "/events?ref=home&view=compact#calendar"
  );
  assert.equal(
    t.toolResetUrl("rentals", {href: "https://www.bouldercreeklocal.com/rentals?q=studio&extended=owner-value#list"}),
    "/rentals?extended=owner-value#list"
  );
});

test("Reset replaces the current history entry instead of adding one", () => {
  let call;
  const history = {replaceState(...args) { call = args; }};
  const next = t.replaceToolResetUrl("jobs", {href: "https://www.bouldercreeklocal.com/jobs?q=Nurse#board"}, history);
  assert.equal(next, "/jobs#board");
  assert.deepEqual(call, [null, "", "/jobs#board"]);
});

test("all three Reset handlers apply the URL cleanup", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "bcl-tools.js"), "utf8");
  for (const kind of ["jobs", "events", "rentals"]) {
    assert.match(source, new RegExp(`replaceToolResetUrl\\("${kind}", location, history\\)`));
  }
});

