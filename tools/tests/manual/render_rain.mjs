/* Visual and geometry harness for the rain tracker. Run by hand, not by
   `node --test`: it needs puppeteer, which lives at the user level on this
   machine rather than in this repo.

     node tools/tests/manual/render_rain.mjs
     PUPPETEER=<path to puppeteer> node tools/tests/manual/render_rain.mjs

   Why it exists: the dataviz palette validator checks colour, not layout, and
   agent-memory/bcl-chart-palette.md is explicit that you must render the chart
   and LOOK at it. On the article's chart that caught clipped labels that no
   text extraction would have shown. This harness caught three more:
     * the median and mean reference labels landing on the 1944 to 1949
       columns, because the widest gap in the record is only three years wide
       (fixed by moving them outside the plot);
     * the rightmost direct label reaching the chart edge (fixed by clamping);
     * the charts shrinking their axis text to 7px on a phone instead of
       scrolling inside their own container.

   It also asserts the control row's geometry in its FILLED state. An aria-live
   region is invisible until it is not, so an empty row proves nothing: the
   status message has to be a full-width sibling of the fields with an explicit
   order, or flex-end alignment leaves the two selects at different heights.

   Writes screenshots next to itself under _render/ (git-ignored). Local only:
   a file:// page with fetch stubbed, no network, nothing deployed. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(HERE, "..", "..", "..");
const OUT = path.join(HERE, "_render");
fs.mkdirSync(OUT, { recursive: true });

const puppeteer = require(process.env.PUPPETEER || "C:/Users/Adrie/node_modules/puppeteer");
const url = p => "file:///" + p.split(path.sep).join("/");

const tools = fs.readFileSync(path.join(ASSETS, "tools", "bcl-tools.js"), "utf8");
const rain = fs.readFileSync(path.join(ASSETS, "data", "rain.json"), "utf8");
const shell = fs.readFileSync(path.join(ASSETS, "squarespace", "pages", "rain.html"), "utf8");

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>body{margin:0;background:#fffdf8;font-family:Inter,Arial,sans-serif;}
.wrap{max-width:1100px;margin:0 auto;padding:0 16px;}</style></head><body>
<div class="wrap">${shell}</div>
<script>window.__RAIN__=${rain};
window.fetch=function(u){return Promise.resolve({ok:true,status:200,json:function(){
  if(String(u).indexOf("rain.json")>=0) return Promise.resolve(window.__RAIN__);
  return Promise.reject(new Error("blocked: "+u));}});};
</script>
<script>${tools}</script>
</body></html>`;

const okPage = path.join(OUT, "harness.html");
const failPage = path.join(OUT, "harness_unavailable.html");
fs.writeFileSync(okPage, html, "utf8");
fs.writeFileSync(failPage, html.replace("window.__RAIN__=" + rain, "window.__RAIN__=null"), "utf8");

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const errors = [];
const checks = [];
const ok = (name, cond) => checks.push((cond ? "PASS " : "FAIL ") + name);

async function shot(page, out, width, after) {
  const p = await browser.newPage();
  p.on("console", m => { if (m.type() === "error") errors.push(out + ": " + m.text()); });
  p.on("pageerror", e => errors.push(out + ": pageerror " + e.message));
  await p.setViewport({ width, height: 1400, deviceScaleFactor: 1.5 });
  await p.goto(url(page));
  await new Promise(r => setTimeout(r, 700));
  if (after) await after(p);
  await new Promise(r => setTimeout(r, 400));
  await p.screenshot({ path: path.join(OUT, out), fullPage: true });
  const text = await p.evaluate(() => document.getElementById("bcl-rain").innerText);
  await p.close();
  return text;
}

const full = await shot(okPage, "rain-1100.png", 1100);
await shot(okPage, "rain-390.png", 390);
await shot(okPage, "rain-1100-lookup.png", 1100, p => p.select("#bcl-rain-year", "1977"));
await shot(okPage, "rain-1100-recent.png", 1100, async p => {
  await p.select("#bcl-rain-year", "2021");
  await p.select("#bcl-rain-scope", "recent");
});
const failText = await shot(failPage, "rain-unavailable.png", 1100);

ok("season total rendered", /\d+\.\d\d in/.test(full));
ok("the reading date and its age are on the page", /LAST READING AT THE GAUGE/.test(full));
ok("the gap note is on the page", /no reading at the gauge|complete total/.test(full));
ok("storm totals rendered", /Storms this water year/.test(full));
ok("the extremes tables rendered", /Wettest water years on record/.test(full));
ok("no undefined or NaN anywhere", !/undefined|NaN/.test(full));
ok("the failure state says unavailable", /unavailable/i.test(failText));
ok("the failure state refuses an all-clear",
  !/all.clear/i.test(failText) && /not a statement about rain/i.test(failText));
ok("no console errors", errors.length === 0);

/* Phone: the charts scroll inside their own container and the tool spills nothing.
   The site-wide promo ticker uses width:100vw and is out of scope here. */
const nb = await browser.newPage();
await nb.setViewport({ width: 390, height: 900 });
await nb.goto(url(okPage));
await new Promise(r => setTimeout(r, 800));
const mobile = await nb.evaluate(() => {
  const w = document.documentElement.clientWidth;
  const charts = [...document.querySelectorAll(".bcl-rain-chart")];
  const spill = [...document.getElementById("bcl-rain").querySelectorAll("*")]
    .filter(el => !el.closest(".bcl-rain-chart") &&
                  el.getBoundingClientRect().width > 0 &&
                  el.getBoundingClientRect().right > w + 1)
    .map(el => el.tagName + "." + String(el.className).slice(0, 30));
  return {
    spill: spill.slice(0, 6),
    chartsScroll: charts.every(c => c.scrollWidth > c.clientWidth),
    svgWidths: charts.map(c => Math.round(c.querySelector("svg").getBoundingClientRect().width))
  };
});
await nb.close();
ok("on a phone nothing in the tool spills past the viewport", mobile.spill.length === 0);
ok("on a phone the charts scroll in their own container", mobile.chartsScroll);
ok("on a phone the charts stay legible instead of shrinking", mobile.svgWidths.every(w => w >= 700));

/* The control row, empty and then FILLED. */
const p = await browser.newPage();
await p.setViewport({ width: 1100, height: 1000 });
await p.goto(url(okPage));
await new Promise(r => setTimeout(r, 700));
const geom = () => p.evaluate(() => {
  const row = document.querySelector(".bcl-rain-controls");
  const sels = [...row.querySelectorAll("select")].map(s => s.getBoundingClientRect());
  const msg = row.querySelector(".bcl-rain-msg");
  const mr = msg.getBoundingClientRect(), rr = row.getBoundingClientRect();
  return {
    tops: sels.map(r => Math.round(r.top)), heights: sels.map(r => Math.round(r.height)),
    msgParent: String(msg.parentElement.className), msgVisible: mr.height > 0,
    msgLeftAligned: Math.abs(mr.left - rr.left) < 2,
    msgBasis: getComputedStyle(msg).flexBasis,
    msgOrder: Number(getComputedStyle(msg).order),
    fieldOrders: [...row.querySelectorAll(".bcl-rain-field")].map(f => Number(getComputedStyle(f).order)),
    msgBelow: mr.top >= Math.max(...sels.map(r => r.bottom)) - 1,
    text: msg.textContent.trim()
  };
});
const empty = await geom();
await p.select("#bcl-rain-year", "1977");
await new Promise(r => setTimeout(r, 250));
const filled = await geom();
await p.close();
await browser.close();

ok("the selects share a top edge when the row is empty", new Set(empty.tops).size === 1);
ok("the selects still share a top edge when the message is FILLED",
  new Set(filled.tops).size === 1 && filled.tops.join() === empty.tops.join());
ok("the selects keep equal heights when filled", new Set(filled.heights).size === 1);
ok("the message is a child of the row, not of a field",
  filled.msgParent.indexOf("bcl-rain-controls") >= 0);
/* Its rendered width is deliberately capped at 80ch for line length, so the
   property to assert is "own row, left-aligned", not "full pixel width". */
ok("the message takes its own full-width row",
  filled.msgVisible && filled.msgBasis === "100%" && filled.msgLeftAligned);
ok("the message has an explicit order after both fields",
  filled.msgOrder > Math.max(...filled.fieldOrders));
ok("the message sits below both controls", filled.msgBelow);
ok("the message carries the lookup result", /1977/.test(filled.text));

console.log(checks.join("\n"));
console.log("\nempty row: " + JSON.stringify(empty));
console.log("filled row: " + JSON.stringify(filled));
console.log("mobile: " + JSON.stringify(mobile));
console.log("\nscreenshots in " + OUT + " -- open them and look.");
if (errors.length) console.log("\nCONSOLE ERRORS:\n" + errors.join("\n"));
if (checks.some(c => c.startsWith("FAIL"))) process.exitCode = 1;
