const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const fs = require("node:fs");

const tools = require(path.join(__dirname, "../bcl-tools.js"));
const records = require(path.join(__dirname, "../../data/search-index.json")).records;
const jobs = require(path.join(__dirname, "../../data/jobs.json")).jobs;
const rentals = require(path.join(__dirname, "../../data/rentals.json")).rentals;
const events = require(path.join(__dirname, "../../data/events.json")).events;
const source = fs.readFileSync(path.join(__dirname, "../bcl-tools.js"), "utf8");

function first(type, predicate) {
  const record = records.find((r) => r.t === type && (!predicate || predicate(r)));
  assert.ok(record, `expected a ${type} search record`);
  return record;
}

test("real event, job, and rental hits carry their name into the destination query", () => {
  const cases = [
    [first("event"), "/events"],
    [first("job"), "/jobs"],
    [first("rental"), "/rentals"],
  ];
  for (const [record, pathName] of cases) {
    const href = tools.toolSearchHref(record);
    assert.match(href, new RegExp("^" + pathName + "\\?q="));
    const state = tools.toolSearchState(href.slice(href.indexOf("?")));
    assert.equal(state.q, record.n, href);
  }
});

test("remote job hits restore the remote tab, while non-remote hits include extended commute", () => {
  const remote = first("job", (r) => /(^|[\s_-])remote(?=$|[\s_-])/i.test(r.k || ""));
  const local = first("job", (r) => !/(^|[\s_-])remote(?=$|[\s_-])/i.test(r.k || ""));
  assert.equal(tools.toolSearchState(tools.toolSearchHref(remote).split("?")[1]).tab, "remote");
  assert.equal(tools.toolSearchState(tools.toolSearchHref(remote).split("?")[1]).includeExtended, false);
  assert.equal(tools.toolSearchState(tools.toolSearchHref(local).split("?")[1]).tab, "local");
  assert.equal(tools.toolSearchState(tools.toolSearchHref(local).split("?")[1]).includeExtended, true);
  assert.deepEqual(tools.toolSearchState("?q=Known&tab=unexpected"), { q: "Known", tab: "local", includeExtended: false });
});

test("search destinations encode ampersands and Unicode without losing the original name", () => {
  const record = { t: "event", n: "Caf\u00e9 & Ni\u00f1o" , u: "/events" };
  const href = tools.toolSearchHref(record);
  assert.equal(href, "/events?q=Caf%C3%A9%20%26%20Ni%C3%B1o");
  assert.deepEqual(tools.toolSearchState(href.slice(href.indexOf("?"))), { q: "Caf\u00e9 & Ni\u00f1o", tab: "local", includeExtended: false });
});

test("same-name records preserve a shared query instead of inventing an unstable record id", () => {
  const firstOccurrence = { t: "event", n: "First Friday", u: "/events" };
  const secondOccurrence = { t: "event", n: "First Friday", u: "/events" };
  assert.equal(tools.toolSearchHref(firstOccurrence), "/events?q=First%20Friday");
  assert.equal(tools.toolSearchHref(secondOccurrence), "/events?q=First%20Friday");
});

test("a missing or stale query remains visible in a useful escaped empty state", () => {
  const html = tools.toolSearchEmptyMessage("jobs", 'Closed <role>');
  assert.match(html, /No jobs match "Closed &lt;role&gt;" right now/);
  assert.match(html, /may have closed or changed/);
  assert.match(html, /editing or clearing the search/);
  assert.match(html, /href="\/contact"/);
});

test("every indexed tool record reaches a current local source match with its destination state", () => {
  const indexedJobs = records.filter((r) => r.t === "job");
  const indexedRentals = records.filter((r) => r.t === "rental");
  const indexedEvents = records.filter((r) => r.t === "event");
  assert.equal(indexedJobs.length, 305);
  assert.equal(indexedRentals.length, 2);
  assert.equal(indexedEvents.length, 137);

  indexedJobs.forEach((record) => {
    const state = tools.toolSearchState(tools.toolSearchHref(record).split("?")[1]);
    const shown = tools.filterJobs(jobs, { tab: state.tab, q: state.q, includeExtended: state.includeExtended });
    assert.ok(shown.some((job) => job.title === record.n), `job destination hides ${record.n}`);
  });
  indexedRentals.forEach((record) => {
    const state = tools.toolSearchState(tools.toolSearchHref(record).split("?")[1]);
    const shown = tools.filterRentals(rentals, { q: state.q, verifiedOnly: true });
    assert.ok(shown.some((rental) => rental.headline === record.n), `rental destination hides ${record.n}`);
  });
  indexedEvents.forEach((record) => {
    const state = tools.toolSearchState(tools.toolSearchHref(record).split("?")[1]);
    assert.ok(events.some((event) => event.title === record.n && tools.eventMatchesQuery(event, state.q)), `event source misses ${record.n}`);
  });
});

test("a Jobs or Rentals root is initialized at most once per page load", () => {
  const attrs = new Map();
  const root = {
    getAttribute: (name) => attrs.get(name) || null,
    setAttribute: (name, value) => attrs.set(name, value)
  };
  assert.equal(tools.claimToolRoot(root, "jobs"), true);
  assert.equal(tools.claimToolRoot(root, "jobs"), false);
  assert.equal(tools.claimToolRoot(root, "rentals"), true);
});

test("each destination restores its query before its first render", () => {
  assert.match(source, /function initJobs[\s\S]*?var searchState = toolSearchState\(location\.search\);[\s\S]*?if \(searchState\.q\) input\.value = searchState\.q;[\s\S]*?if \(searchState\.includeExtended\) extBox\.checked = true;[\s\S]*?syncEmployers\(\);\s*render\(\);/);
  assert.match(source, /function initRentals[\s\S]*?var searchState = toolSearchState\(location\.search\);[\s\S]*?if \(searchState\.q\) input\.value = searchState\.q;[\s\S]*?render\(\);/);
  assert.match(source, /function initEvents[\s\S]*?var searchState = toolSearchState\(location\.search\);[\s\S]*?if \(searchState\.q\) input\.value = searchState\.q;[\s\S]*?render\(\);/);
});
