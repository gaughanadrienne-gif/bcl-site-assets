const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const SRC = fs.readFileSync(path.join(__dirname, "..", "bcl-tools.js"), "utf8");
/* Comments name the retired token on purpose, to explain why it went. Only
   what actually ships as CSS is checked below. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "");

/* The page background behind the tools. Muted text sits on this, and it is the
   darkest of the two surfaces (cards are #fffdf8), so clearing it clears both. */
const CREAM = "#f5f1e7";

function luminance(hex) {
  const h = hex.replace("#", "");
  const chan = [0, 2, 4]
    .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test("the contrast maths agrees with the measured failure it was written to fix", () => {
  // Negative control: the retired token really is the 4.49 that failed AA.
  assert.ok(Math.abs(contrast("#67716b", CREAM) - 4.49) < 0.01);
});

test("the retired #67716b muted token is gone from the tool stylesheet", () => {
  // It missed WCAG AA on the cream background by 0.01 and produced 966 of the
  // design audit's findings. Re-adding it would fail silently to the eye.
  assert.equal(CODE.includes("#67716b"), false);
});

test("every colour the tools paint muted text in clears WCAG AA on the page background", () => {
  const muted = [...new Set([...SRC.matchAll(/--bcl-muted:\s*(#[0-9a-f]{6})/gi)].map((m) => m[1]))];
  assert.ok(muted.length > 0, "expected the stylesheet to override --bcl-muted");
  muted.forEach((c) => {
    const ratio = contrast(c, CREAM);
    assert.ok(ratio >= 4.5, `${c} on ${CREAM} is ${ratio.toFixed(2)}:1, below the 4.5 AA floor`);
  });
});

test("the --bcl-muted override ships, because the token itself lives in Code Injection", () => {
  // That panel cannot be read back or driven by script and has caused permanent
  // loss, so the override in this stylesheet is the supported route.
  assert.match(SRC, /":root\{--bcl-muted:#[0-9a-f]{6};\}"/i);
});

test("CSS_ID is versioned, and injectCSS clears older stylesheets before writing", () => {
  // injectCSS() returns early if an element with this id exists, so the id has
  // to change whenever the stylesheet does. The sweep of style[id^=...] is what
  // stops a cached copy of this script leaving new markup unstyled.
  assert.match(SRC, /var CSS_ID = "bcl-tools-css-v\d+";/);
  assert.match(SRC, /querySelectorAll\("style\[id\^='bcl-tools-css'\]"\)/);
});

test("the sticky chip row opts its wrapper out of overflow:hidden, or it cannot stick", () => {
  // .bcl-tool{overflow:hidden} comes from the header Code Injection and makes
  // the tool its own scroll container. Measured on the live page before the
  // opt-out: the chip row did not move relative to the viewport on scroll.
  assert.match(SRC, /\.bcl-tool\.bcl-has-sticky\{overflow:visible;\}/);
  assert.match(SRC, /bcl-has-sticky/);
  // Scoped: the class is added only where chips mount, never site-wide.
  assert.match(SRC, /closest\("\.bcl-tool"\)/);
});

test("article service cards use the settled surface and accessible action styles", () => {
  assert.match(SRC, /\.bcl-article-layout>\.bcl-menu[^\n]+background:#fffdf8!important/);
  assert.match(SRC, /border:1px solid #e3ddcf!important;border-radius:8px!important;box-shadow:none!important/);
  assert.match(SRC, /\.bcl-menu__cta:focus-visible\{outline:3px solid #d56e47/);
  assert.match(SRC, /--muted:#626c66/);
});
