/* Browser fixture check for the bounded Directory and Events previews.
 * Run with the bundled Playwright runtime, for example:
 * NODE_PATH=.../node_modules node tools/tests/browse-batches.browser.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const scriptPath = path.join(repo, "tools/bcl-tools.js");
const headerInjectionPath = path.join(repo, "squarespace/01_HEADER_INJECTION.html");
const directory = JSON.parse(fs.readFileSync(path.join(repo, "data/directory.json"), "utf8"));

/* Use the checked-in BCL header-injection stylesheet and the actual Fluid
 * Engine containment hierarchy. The widget alone can make a false overflow
 * finding because it omits the scoped .bcl-full breakout rules that own this
 * page's width. This is deliberately a source-baseline fixture, not a CSS
 * reset or an overflow clip. */
const headerStyles = [...fs.readFileSync(headerInjectionPath, "utf8").matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
  .map((match) => match[1])
  .join("\n");

function squarespaceShell(mountId) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>
    html,body{margin:0;padding:0;min-width:0} .page-section,.content-wrapper,.fluid-engine,.fe-block,.sqs-block,.sqs-block-code,.sqs-block-content{min-width:0}
    .fluid-engine{display:grid;grid-template-columns:minmax(0,1fr)} .fe-block{min-width:0}
    ${headerStyles}
  </style></head><body><section class="page-section"><div class="content-wrapper"><div class="fluid-engine"><div class="fe-block"><div class="sqs-block sqs-block-code"><div class="sqs-block-content"><div class="bcl bcl-full"><section class="bcl-section"><div class="bcl-wrap"><div class="bcl-tool"><div class="bcl-tool-body"><div id="${mountId}"></div></div></div></div></section></div></div></div></div></div></div></section></body></html>`;
}

function eventFixture() {
  return {
    updated: "2026-09-05",
    events: Array.from({ length: 61 }, (_, index) => ({
      title: `Fixture event ${String(index + 1).padStart(2, "0")}`,
      start: `2099-10-${String((index % 27) + 1).padStart(2, "0")}`,
      end: "",
      location: "Boulder Creek",
      url: "https://example.test/event",
      description: "Browser fixture event",
      category: index % 2 ? "Community" : "Music & Arts"
    }))
  };
}

function localAsset(urlPath) {
  var requested;
  try { requested = decodeURIComponent(urlPath); } catch (error) { return null; }
  if (!requested.startsWith("/brand/")) return null;
  const candidate = path.resolve(repo, `.${requested}`);
  const root = `${repo}${path.sep}`;
  if (!candidate.startsWith(root) || !fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) return null;
  return candidate;
}

async function boot(browser, pagePath, dataPath, payload, mountId, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.addInitScript(() => { window.BCL_REPO = "http://bcl.local"; });
  await page.route("http://bcl.local/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === dataPath) {
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(payload) });
    }
    const asset = localAsset(url.pathname);
    if (asset) return route.fulfill({ path: asset });
    return route.fulfill({ contentType: "text/html", body: squarespaceShell(mountId) });
  });
  await page.goto(`http://bcl.local${pagePath}`);
  await page.addScriptTag({ path: scriptPath });
  return { context, page };
}

async function cardCount(page, selector) {
  return page.locator(selector).count();
}

async function horizontalOverflow(page, label) {
  const measurement = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
    bodyMargin: getComputedStyle(document.body).margin,
    wrapWidth: getComputedStyle(document.querySelector(".bcl-wrap")).width,
    chips: (() => { const element = document.querySelector(".bcl-chips"); const style = element && getComputedStyle(element); return element && { client: element.clientWidth, scroll: element.scrollWidth, display: style.display, overflowX: style.overflowX, overflowY: style.overflowY, width: style.width }; })(),
    bounds: [document.documentElement, document.body, document.querySelector(".page-section"), document.querySelector(".bcl-full"), document.querySelector(".bcl-wrap"), document.querySelector(".bcl-tool"), document.getElementById("bcl-directory")].filter(Boolean).map((element) => ({ tag: element.tagName, id: element.id, className: element.className, left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right, style: getComputedStyle(element).width })),
    offenders: [...document.querySelectorAll("*")]
      .filter((element) => element.scrollWidth > document.documentElement.clientWidth)
      .slice(0, 3)
      .map((element) => ({ tag: element.tagName, className: element.className, width: element.scrollWidth })),
    rectOffenders: [...document.querySelectorAll("*")]
      .filter((element) => !element.closest(".bcl-chips") && element.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
      .slice(0, 20)
      .map((element) => ({ tag: element.tagName, id: element.id, className: element.className, parentClass: element.parentElement && element.parentElement.className, right: Math.round(element.getBoundingClientRect().right) }))
  }));
  measurement.label = label;
  measurement.hasOverflow = measurement.scroll > measurement.client;
  return measurement;
}

async function run() {
  const bundled = chromium.executablePath();
  const executablePath = [process.env.BCL_BROWSER_PATH, bundled, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].find((candidate) => candidate && fs.existsSync(candidate));
  assert.ok(executablePath, "a local Chromium-family browser is required for this fixture check");
  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    const directoryRun = await boot(browser, "/directory", "/data/directory.json", directory, "bcl-directory", { width: 1440, height: 960 });
    const directoryPage = directoryRun.page;
    await directoryPage.waitForFunction(() => document.querySelectorAll(".bcl-dir-card").length === 24);
    assert.equal(await cardCount(directoryPage, ".bcl-dir-card"), 24, "directory starts at 24 cards");
    assert.match(await directoryPage.locator(".bcl-count[aria-live]").innerText(), /SHOWING 24 OF 322 MATCHING/);
    await directoryPage.waitForFunction(() => {
      const visible = [...document.querySelectorAll(".bcl-dir-tile")].filter((image) => image.getBoundingClientRect().top < innerHeight);
      return visible.length > 0 && visible.every((image) => image.complete && image.naturalWidth > 0);
    });
    const directoryDesktopOverflow = await horizontalOverflow(directoryPage, "directory desktop fixture");
    assert.equal(directoryDesktopOverflow.hasOverflow, false, `directory desktop site-shell fixture has no horizontal overflow: ${JSON.stringify(directoryDesktopOverflow)}`);
    assert.equal(await directoryPage.locator(".bcl-tool").evaluate((element) => element.classList.contains("bcl-has-sticky")), true, "directory keeps sticky chips at desktop width");
    await directoryPage.setViewportSize({ width: 390, height: 844 });
    await directoryPage.waitForFunction(() => !document.querySelector(".bcl-tool").classList.contains("bcl-has-sticky"));
    assert.equal(await directoryPage.locator(".bcl-chips").evaluate((element) => getComputedStyle(element).position), "static", "directory chips return to ordinary flow on mobile resize");
    const directoryResizedMobileOverflow = await horizontalOverflow(directoryPage, "directory desktop-to-mobile resize fixture");
    assert.equal(directoryResizedMobileOverflow.hasOverflow, false, `directory desktop-to-mobile resize has no horizontal overflow: ${JSON.stringify(directoryResizedMobileOverflow)}`);
    await directoryPage.setViewportSize({ width: 1440, height: 960 });
    await directoryPage.waitForFunction(() => document.querySelector(".bcl-tool").classList.contains("bcl-has-sticky"));
    assert.equal(await directoryPage.locator(".bcl-chips").evaluate((element) => getComputedStyle(element).position), "sticky", "directory restores sticky chips after a desktop resize");
    const directoryResizedDesktopOverflow = await horizontalOverflow(directoryPage, "directory mobile-to-desktop resize fixture");
    assert.equal(directoryResizedDesktopOverflow.hasOverflow, false, `directory mobile-to-desktop resize has no horizontal overflow: ${JSON.stringify(directoryResizedDesktopOverflow)}`);
    if (process.env.BCL_SCREENSHOT_DIR) {
      fs.mkdirSync(process.env.BCL_SCREENSHOT_DIR, { recursive: true });
      await directoryPage.screenshot({ path: path.join(process.env.BCL_SCREENSHOT_DIR, "directory-desktop.png") });
    }
    await directoryPage.locator(".bcl-load-more button").click();
    await directoryPage.waitForFunction(() => document.querySelectorAll(".bcl-dir-card").length === 48);
    assert.equal(await cardCount(directoryPage, ".bcl-dir-card"), 48, "directory next batch adds 24 cards");
    assert.equal(await directoryPage.evaluate(() => document.activeElement === document.querySelector(".bcl-load-more button")), true, "directory retains keyboard focus on Load more");
    if (process.env.BCL_SCREENSHOT_DIR) {
      await directoryPage.locator(".bcl-load-more button").scrollIntoViewIfNeeded();
      await directoryPage.screenshot({ path: path.join(process.env.BCL_SCREENSHOT_DIR, "directory-desktop-load-more.png") });
    }
    await directoryPage.locator("select").selectOption({ index: 1 });
    await directoryPage.waitForFunction(() => document.querySelectorAll(".bcl-dir-card").length <= 24);
    assert.ok(await cardCount(directoryPage, ".bcl-dir-card") <= 24, "directory filter resets to first batch");
    await directoryPage.locator('input[type="search"]').fill("zzzx no matching listing");
    await directoryPage.waitForFunction(() => document.querySelector(".bcl-count[aria-live]").textContent.includes("SHOWING 0 OF 0"));
    assert.equal(await directoryPage.locator(".bcl-load-more").isHidden(), true, "directory hides Load more for zero results");
    await directoryRun.context.close();

    const directoryMobileRun = await boot(browser, "/directory", "/data/directory.json", directory, "bcl-directory", { width: 390, height: 844 });
    const directoryMobilePage = directoryMobileRun.page;
    await directoryMobilePage.waitForFunction(() => document.querySelectorAll(".bcl-dir-card").length === 24);
    assert.equal(await directoryMobilePage.locator(".bcl-tool").evaluate((element) => element.classList.contains("bcl-has-sticky")), false, "directory starts without desktop sticky containment at mobile width");
    await directoryMobilePage.waitForFunction(() => {
      const visible = [...document.querySelectorAll(".bcl-dir-tile")].filter((image) => image.getBoundingClientRect().top < innerHeight);
      return visible.length > 0 && visible.every((image) => image.complete && image.naturalWidth > 0);
    });
    if (process.env.BCL_SCREENSHOT_DIR) await directoryMobilePage.screenshot({ path: path.join(process.env.BCL_SCREENSHOT_DIR, "directory-mobile.png") });
    const directoryMobileOverflow = await horizontalOverflow(directoryMobilePage, "directory mobile fixture");
    assert.equal(directoryMobileOverflow.hasOverflow, false, `directory mobile site-shell fixture has no horizontal overflow: ${JSON.stringify(directoryMobileOverflow)}`);
    await directoryMobileRun.context.close();

    const eventsRun = await boot(browser, "/events", "/data/events.json", eventFixture(), "bcl-events", { width: 1440, height: 960 });
    const eventsPage = eventsRun.page;
    await eventsPage.waitForFunction(() => document.querySelectorAll(".bcl-event-card").length === 24);
    assert.equal(await cardCount(eventsPage, ".bcl-event-card"), 24, "events start at 24 cards");
    const eventsDesktopOverflow = await horizontalOverflow(eventsPage, "events desktop fixture");
    assert.equal(eventsDesktopOverflow.hasOverflow, false, `events desktop fixture has no horizontal overflow: ${JSON.stringify(eventsDesktopOverflow)}`);
    if (process.env.BCL_SCREENSHOT_DIR) await eventsPage.screenshot({ path: path.join(process.env.BCL_SCREENSHOT_DIR, "events-desktop.png") });
    await eventsPage.locator(".bcl-load-more button").click();
    await eventsPage.waitForFunction(() => document.querySelectorAll(".bcl-event-card").length === 48);
    assert.equal(await cardCount(eventsPage, ".bcl-event-card"), 48, "events next batch adds 24 cards");
    assert.equal(await eventsPage.evaluate(() => document.activeElement === document.querySelector(".bcl-load-more button")), true, "events retain keyboard focus on Load more");
    await eventsPage.locator(".bcl-ev-sort").selectOption("name");
    await eventsPage.waitForFunction(() => document.querySelectorAll(".bcl-event-card").length === 24);
    assert.equal(await cardCount(eventsPage, ".bcl-event-card"), 24, "event sort resets to first batch");
    await eventsPage.locator(".bcl-ev-q").fill("zzzx no matching event");
    await eventsPage.waitForFunction(() => document.querySelector(".bcl-count[aria-live]").textContent.includes("SHOWING 0 OF 0"));
    assert.equal(await eventsPage.locator(".bcl-load-more").isHidden(), true, "events hide Load more for zero results");
    await eventsPage.locator(".bcl-ev-q").fill("");
    await eventsPage.waitForFunction(() => document.querySelectorAll(".bcl-event-card").length === 24);
    while (!(await eventsPage.locator(".bcl-load-more").isHidden())) await eventsPage.locator(".bcl-load-more button").click();
    assert.equal(await cardCount(eventsPage, ".bcl-event-card"), 61, "all event fixture records remain reachable");
    assert.match(await eventsPage.locator(".bcl-count[aria-live]").innerText(), /SHOWING 61 OF 61 MATCHING · 61 UPCOMING/);
    assert.equal(await eventsPage.evaluate(() => document.activeElement === document.querySelector(".bcl-count[aria-live]")), true, "focus moves to the final count when Load more disappears");
    assert.ok(await eventsPage.locator("[data-ics]").count() > 0, "calendar controls remain present after batching");
    await eventsRun.context.close();

    const eventsMobileRun = await boot(browser, "/events", "/data/events.json", eventFixture(), "bcl-events", { width: 390, height: 844 });
    const eventsMobilePage = eventsMobileRun.page;
    await eventsMobilePage.waitForFunction(() => document.querySelectorAll(".bcl-event-card").length === 24);
    if (process.env.BCL_SCREENSHOT_DIR) await eventsMobilePage.screenshot({ path: path.join(process.env.BCL_SCREENSHOT_DIR, "events-mobile.png") });
    const eventsMobileOverflow = await horizontalOverflow(eventsMobilePage, "events mobile fixture");
    assert.equal(eventsMobileOverflow.hasOverflow, false, `events mobile fixture has no horizontal overflow: ${JSON.stringify(eventsMobileOverflow)}`);
    await eventsMobileRun.context.close();
  } finally {
    await browser.close();
  }
}

run().then(() => console.log("browse-batches browser fixture: PASS")).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
