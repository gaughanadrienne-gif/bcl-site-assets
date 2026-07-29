const test = require("node:test");
const assert = require("node:assert");
const t = require("../bcl-tools.js");

/* These ids are the wiring. If one of them drifts, signups go to the wrong
   account, the wrong form, or nowhere, and the box still looks fine on the
   page. Source of truth: Automation & Operations/mailerlite/WIRING_IDS.md. */
test("the alerts box is wired to the job-alerts form and group", () => {
  assert.equal(t.JOB_ALERTS.account, "2514969");
  assert.equal(t.JOB_ALERTS.form, "194352772136568142");
  assert.equal(t.JOB_ALERTS.group, "194345872038823754");
  assert.equal(t.JOB_ALERTS.source, "jobs-board");
});

test("the endpoint is the MailerLite subscribe URL for that form", () => {
  assert.equal(t.jobAlertsEndpoint(),
    "https://assets.mailerlite.com/jsonp/2514969/forms/194352772136568142/subscribe");
});

test("the posted body carries the email and the signup source", () => {
  const body = t.jobAlertsBody("neighbor@example.com");
  const params = new URLSearchParams(body);
  assert.equal(params.get("fields[email]"), "neighbor@example.com");
  assert.equal(params.get("fields[signup_source]"), "jobs-board");
  assert.equal(params.get("ml-submit"), "1");
  assert.equal(params.get("anticsrf"), "true");
});

test("addresses with characters that break a URL are encoded, not dropped", () => {
  const params = new URLSearchParams(t.jobAlertsBody(" a+jobs@example.co.uk "));
  assert.equal(params.get("fields[email]"), "a+jobs@example.co.uk",
    "a plus address must survive the round trip, and surrounding space must not");
});

test("obvious typos are caught before a request is spent", () => {
  assert.equal(t.looksLikeEmail("neighbor@example.com"), true);
  assert.equal(t.looksLikeEmail("a.b+c@mail.example.co.uk"), true);
  assert.equal(t.looksLikeEmail(""), false);
  assert.equal(t.looksLikeEmail("   "), false);
  assert.equal(t.looksLikeEmail("neighbor"), false);
  assert.equal(t.looksLikeEmail("neighbor@example"), false, "no dot means no domain");
  assert.equal(t.looksLikeEmail("neighbor@@example.com"), false);
  assert.equal(t.looksLikeEmail("two words@example.com"), false);
  assert.equal(t.looksLikeEmail(null), false);
});

/* Double opt-in is ON for this form, so a 200 is a confirmation email and not
   a subscription. The success copy has to say that or it is a lie the reader
   only finds out about when Monday brings nothing. */
test("success copy sends the reader to their inbox, and never claims they are signed up", () => {
  const ok = t.jobAlertsMessage("ok");
  assert.equal(ok.bad, false);
  assert.match(ok.text, /confirmation link/i);
  assert.doesNotMatch(ok.text, /you are (now )?(signed up|subscribed)/i);
});

test("failure copy admits the failure and offers a way through", () => {
  const fail = t.jobAlertsMessage("fail");
  assert.equal(fail.bad, true);
  assert.match(fail.text, /did not go through/i);
  assert.match(fail.text, /hello@bouldercreeklocal\.com/);
});

test("an unknown state says nothing rather than guessing", () => {
  assert.equal(t.jobAlertsMessage("nonsense").text, "");
  assert.equal(t.jobAlertsMessage(undefined).text, "");
});

test("the box carries the promised line, an email input, and a submit button", () => {
  const html = t.jobAlertsHTML();
  assert.match(html, /New valley jobs in your inbox on Mondays\. No noise, unsubscribe anytime\./);
  assert.match(html, /type="email"/);
  assert.match(html, /type="submit"/);
  assert.match(html, /aria-live="polite"/, "the result has to reach a screen reader");
  assert.match(html, /class="bcl-sr-only" for="bcl-alerts-email"/, "the input needs a real label");
});

/* House style, enforced rather than remembered. */
test("the box copy has no em-dashes, no emoji, and no announced honesty", () => {
  const html = t.jobAlertsHTML();
  const copy = [html, t.jobAlertsMessage("ok").text, t.jobAlertsMessage("fail").text,
    t.jobAlertsMessage("invalid").text, t.jobAlertsMessage("sending").text].join(" ");
  assert.doesNotMatch(copy, /[—–]/, "no em-dashes or en-dashes");
  assert.doesNotMatch(copy, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, "no emoji");
  assert.doesNotMatch(copy, /\b(honestly|to be honest|let's be honest|the honest truth|dive into|elevate your)\b/i);
});

/* The box is a jobs-page feature. It must not leak onto the other tools that
   share this script, and the jobs markup must actually contain it. */
test("the alerts box is part of the jobs board markup only", () => {
  assert.ok(t.jobAlertsHTML().indexOf('class="bcl-alerts"') >= 0);
  assert.equal(t.rentalCard({ title: "x", canonical_url: "https://x", source: "s" }).indexOf("bcl-alerts"), -1);
  assert.equal(t.jobCard({ title: "x", canonical_url: "https://x", source: "s" }).indexOf("bcl-alerts"), -1,
    "one box per page, not one per listing");
});
