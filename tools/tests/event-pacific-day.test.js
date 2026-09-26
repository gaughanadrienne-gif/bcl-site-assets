"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {execFileSync} = require("node:child_process");
const path = require("node:path");
const t = require("../bcl-tools.js");

const PDT_BOUNDARY = new Date("2026-09-27T06:30:00.000Z"); // Sep 26, 11:30 PM in Boulder Creek
const PST_BOUNDARY = new Date("2026-01-15T07:30:00.000Z"); // Jan 14, 11:30 PM in Boulder Creek

test("Boulder Creek day keys observe both PDT and PST boundaries", () => {
  assert.equal(t.pacificDayKey(PDT_BOUNDARY), "2026-09-26");
  assert.equal(t.pacificDayKey(PST_BOUNDARY), "2026-01-14");
});

test("a New York reader still gets Boulder Creek's day across both offsets", () => {
  const modulePath = path.join(__dirname, "..", "bcl-tools.js");
  const script = `
    const t = require(${JSON.stringify(modulePath)});
    const pad = n => String(n).padStart(2, "0");
    const result = ${JSON.stringify([PDT_BOUNDARY.toISOString(), PST_BOUNDARY.toISOString()])}.map(value => {
      const d = new Date(value);
      return {
        reader: d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()),
        pacific: t.pacificDayKey(d),
        matches: t.eventInRange({start: t.pacificDayKey(d)}, {range: "today", today: d})
      };
    });
    process.stdout.write(JSON.stringify(result));
  `;
  const result = JSON.parse(execFileSync(process.execPath, ["-e", script], {
    env: {...process.env, TZ: "America/New_York"}, encoding: "utf8"
  }));
  assert.deepEqual(result, [
    {reader: "2026-09-27", pacific: "2026-09-26", matches: true},
    {reader: "2026-01-15", pacific: "2026-01-14", matches: true}
  ]);
});

test("Today and ongoing event decisions use the Pacific calendar day", () => {
  assert.equal(t.eventInRange({start: "2026-09-26"}, {range: "today", today: PDT_BOUNDARY}), true);
  assert.equal(t.eventInRange({start: "2026-09-27"}, {range: "today", today: PDT_BOUNDARY}), false);
  assert.equal(t.evIsOngoing({start: "2026-09-01", end: "2026-09-26"}, PDT_BOUNDARY), true);
  assert.equal(t.eventInRange({start: "2026-01-14"}, {range: "today", today: PST_BOUNDARY}), true);
});

test("weekend and forward ranges start from the Pacific day", () => {
  assert.equal(t.eventInRange({start: "2026-09-26"}, {range: "weekend", today: PDT_BOUNDARY}), true);
  assert.equal(t.eventInRange({start: "2026-10-04"}, {range: "7", today: PDT_BOUNDARY}), false);
  assert.equal(t.eventInRange({start: "2026-10-03"}, {range: "7", today: PDT_BOUNDARY}), true);
});

test("homepage and search keep events current through the Pacific end day", () => {
  const endingTonight = {title: "Exhibit", start: "2026-09-01", end: "2026-09-26"};
  assert.deepEqual(t.nextEvents([endingTonight], t.pacificDayKey(PDT_BOUNDARY), 3), [endingTonight]);
  assert.equal(t.eventIsCurrentForSearch(endingTonight, PDT_BOUNDARY), true);
  assert.equal(t.eventIsCurrentForSearch({start: "2026-09-25"}, PDT_BOUNDARY), false);
});

test("date-only display and ICS values stay on their written calendar day", () => {
  assert.match(t.eventCard({id: "day", title: "Day event", start: "2026-09-26"}), /SAT SEP 26/);
  const ics = t.icsForEvent({id: "day", title: "Day event", start: "2026-09-26"}, PDT_BOUNDARY);
  assert.match(ics, /DTSTART;VALUE=DATE:20260926/);
  assert.match(ics, /DTEND;VALUE=DATE:20260927/);
});
