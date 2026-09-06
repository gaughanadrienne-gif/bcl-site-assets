/* Browser fixture check for the tool filter controls.
 *
 * The defect this exists to catch: `.bcl-controls input` rules written for text
 * inputs also matched the filter CHECKBOXES, so at <=640px the checkbox took
 * `width:100%` of its own `.bcl-checklabel` flex container and squeezed the
 * label text out of view. On the live Directory at 390px that rendered as two
 * unlabelled checkboxes, and the nowrap label text pushed the control row wider
 * than the tool, which is what made the search input reach the clipped edge.
 *
 * Document-level overflow was ZERO the whole time, so an overflow assertion
 * cannot see this. These checks measure the actual laid-out geometry of the
 * label text node and the checkbox box inside the real Squarespace shell.
 *
 * Run with the bundled Playwright runtime, for example:
 * NODE_PATH=.../node_modules node tools/tests/control-labels.browser.mjs
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

const WIDTHS = [320, 390, 768, 1440];

/* Same source-baseline shell as browse-batches.browser.mjs: the checked-in BCL
 * header injection plus the real Fluid Engine containment hierarchy. Not a CSS
 * reset and not an overflow clip. */
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
  let requested;
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

/* Measure what a reader actually sees. The label text is a bare text node, so
 * it is measured with a Range rather than by reading DOM text, which is present
 * either way and therefore proves nothing. */
async function measureControls(page) {
  return page.evaluate(() => {
    const round = (value) => Math.round(value * 100) / 100;
    const tool = document.querySelector(".bcl-tool");
    const toolRect = tool.getBoundingClientRect();
    const controls = document.querySelector(".bcl-controls");

    const checkLabels = [...document.querySelectorAll(".bcl-controls .bcl-checklabel")].map((label) => {
      const box = label.querySelector('input[type="checkbox"],input[type="radio"]');
      const textNodes = [...label.childNodes].filter((node) => node.nodeType === 3 && node.textContent.trim());
      let textRect = null;
      if (textNodes.length) {
        const range = document.createRange();
        range.selectNodeContents(textNodes[0]);
        const rect = range.getBoundingClientRect();
        textRect = { width: round(rect.width), height: round(rect.height), left: round(rect.left), right: round(rect.right) };
      }
      const labelRect = label.getBoundingClientRect();
      const boxRect = box ? box.getBoundingClientRect() : null;
      return {
        text: textNodes.map((node) => node.textContent.trim()).join(" "),
        textRect,
        labelRect: { width: round(labelRect.width), right: round(labelRect.right) },
        labelScrollWidth: label.scrollWidth,
        labelClientWidth: label.clientWidth,
        boxRect: boxRect ? { width: round(boxRect.width), height: round(boxRect.height) } : null,
        boxComputedWidth: box ? getComputedStyle(box).width : null
      };
    });

    const textInputs = [...document.querySelectorAll('.bcl-controls input:not([type="checkbox"]):not([type="radio"])')].map((input) => {
      const rect = input.getBoundingClientRect();
      return { type: input.type, width: round(rect.width), left: round(rect.left), right: round(rect.right) };
    });

    return {
      viewport: window.innerWidth,
      toolRect: { left: round(toolRect.left), right: round(toolRect.right), width: round(toolRect.width) },
      docClientWidth: document.documentElement.clientWidth,
      docScrollWidth: document.documentElement.scrollWidth,
      controlsScrollWidth: controls.scrollWidth,
      controlsClientWidth: controls.clientWidth,
      checkLabels,
      textInputs
    };
  });
}

function assertControls(measurement, label) {
  const where = `${label} @${measurement.viewport}px`;

  for (const control of measurement.checkLabels) {
    const what = `${where} "${control.text}"`;

    /* The reported defect: the label text stops being laid out with any width,
     * so the reader sees a checkbox and nothing else. */
    assert.ok(control.textRect, `${what}: label has a visible text node`);
    assert.ok(
      control.textRect.width >= 20,
      `${what}: label text must actually be laid out, got width ${control.textRect && control.textRect.width} (${JSON.stringify(control)})`
    );
    assert.ok(
      control.textRect.height > 0,
      `${what}: label text must have height (${JSON.stringify(control)})`
    );

    /* ...and it must not be pushed outside its own label box or the tool. */
    assert.ok(
      control.textRect.right <= control.labelRect.right + 1,
      `${what}: label text must sit inside its label box (${JSON.stringify(control)})`
    );
    assert.ok(
      control.textRect.right <= measurement.toolRect.right + 1,
      `${what}: label text must sit inside the tool (${JSON.stringify(control)})`
    );
    assert.ok(
      control.labelScrollWidth <= control.labelClientWidth + 1,
      `${what}: label must not clip its own contents (${JSON.stringify(control)})`
    );

    /* The cause: a checkbox inflated to the full label width. Native checkboxes
     * are ~13-16px; allow headroom without allowing a stretched control. */
    assert.ok(control.boxRect, `${what}: checkbox has a box`);
    assert.ok(
      control.boxRect.width > 0 && control.boxRect.width <= 28,
      `${what}: checkbox must keep compact native sizing, got ${control.boxRect.width}px (${JSON.stringify(control)})`
    );
    assert.ok(
      control.boxRect.height > 0 && control.boxRect.height <= 28,
      `${what}: checkbox must keep compact native height, got ${control.boxRect.height}px (${JSON.stringify(control)})`
    );
  }

  /* Text inputs still fill their row and stay inside the tool. */
  for (const input of measurement.textInputs) {
    assert.ok(
      input.width > 0,
      `${where}: ${input.type} input must be laid out (${JSON.stringify(input)})`
    );
    assert.ok(
      input.right <= measurement.toolRect.right + 1,
      `${where}: ${input.type} input must stay inside the tool, right ${input.right} vs ${measurement.toolRect.right} (${JSON.stringify(input)})`
    );
  }

  /* Containment, checked at the control row rather than only the document, so a
   * clipped ancestor cannot hide an internal overflow. */
  assert.ok(
    measurement.controlsScrollWidth <= measurement.controlsClientWidth + 1,
    `${where}: control row must not overflow itself (${measurement.controlsScrollWidth} vs ${measurement.controlsClientWidth})`
  );
  assert.ok(
    measurement.docScrollWidth <= measurement.docClientWidth,
    `${where}: document must not scroll horizontally (${measurement.docScrollWidth} vs ${measurement.docClientWidth})`
  );
}

async function run() {
  const bundled = chromium.executablePath();
  const executablePath = [process.env.BCL_BROWSER_PATH, bundled, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].find((candidate) => candidate && fs.existsSync(candidate));
  assert.ok(executablePath, "a local Chromium-family browser is required for this fixture check");
  const browser = await chromium.launch({ headless: true, executablePath });
  const failures = [];
  try {
    const directoryRun = await boot(browser, "/directory", "/data/directory.json", directory, "bcl-directory", { width: WIDTHS[WIDTHS.length - 1], height: 960 });
    const directoryPage = directoryRun.page;
    await directoryPage.waitForFunction(() => document.querySelectorAll(".bcl-dir-card").length === 24);

    for (const width of WIDTHS) {
      await directoryPage.setViewportSize({ width, height: 900 });
      await directoryPage.waitForTimeout(150);
      const measurement = await measureControls(directoryPage);
      try { assertControls(measurement, "directory"); } catch (error) { failures.push(error.message); }
    }

    /* Batching and reset still behave at the narrow width the defect appears at. */
    await directoryPage.setViewportSize({ width: 390, height: 844 });
    await directoryPage.waitForTimeout(150);
    assert.equal(await directoryPage.locator(".bcl-dir-card").count(), 24, "directory starts at 24 cards on mobile");
    await directoryPage.locator(".bcl-load-more button").click();
    await directoryPage.waitForFunction(() => document.querySelectorAll(".bcl-dir-card").length === 48);
    assert.equal(await directoryPage.locator(".bcl-dir-card").count(), 48, "directory loads a second batch of 24 on mobile");

    /* Toggling a filter checkbox must still work, and the label stays readable. */
    await directoryPage.locator(".bcl-controls .bcl-bc-only").check();
    await directoryPage.waitForTimeout(250);
    assert.equal(await directoryPage.locator(".bcl-controls .bcl-bc-only").isChecked(), true, "In Boulder Creek filter toggles on");
    const filteredMeasurement = await measureControls(directoryPage);
    try { assertControls(filteredMeasurement, "directory filtered"); } catch (error) { failures.push(error.message); }
    await directoryPage.locator(".bcl-controls .bcl-bc-only").uncheck();
    await directoryPage.waitForFunction(() => document.querySelectorAll(".bcl-dir-card").length === 24);
    assert.equal(await directoryPage.locator(".bcl-dir-card").count(), 24, "clearing the filter resets to 24 cards");

    /* Keyboard reachability and the accessible name from the wrapping label. */
    const focusState = await directoryPage.evaluate(() => {
      const box = document.querySelector(".bcl-controls .bcl-bc-only");
      box.focus();
      return {
        focused: document.activeElement === box,
        tabIndex: box.tabIndex,
        accessibleName: (box.closest("label") || {}).textContent
      };
    });
    assert.equal(focusState.focused, true, "the filter checkbox is keyboard focusable");
    assert.ok(focusState.tabIndex >= 0, "the filter checkbox stays in the tab order");
    assert.match(focusState.accessibleName || "", /In Boulder Creek/, "the checkbox keeps its accessible name from the wrapping label");

    /* Clicking the label text, not just the box, still toggles the filter. */
    await directoryPage.evaluate(() => {
      const label = [...document.querySelectorAll(".bcl-controls .bcl-checklabel")].find((node) => node.textContent.includes("Open now"));
      label.click();
    });
    await directoryPage.waitForTimeout(200);
    assert.equal(await directoryPage.locator(".bcl-controls .bcl-open-now").isChecked(), true, "clicking the label text toggles its checkbox");

    await directoryRun.context.close();

    /* Events has no checkbox filters, Jobs has three and Rentals one. All four
     * surfaces share the same `.bcl-controls` rules, so all four are measured. */
    const surfaces = [
      { label: "events", pagePath: "/events", dataPath: "/data/events.json", payload: eventFixture(), mountId: "bcl-events", ready: ".bcl-event-card" },
      { label: "jobs", pagePath: "/jobs", dataPath: "/data/jobs.json", payload: JSON.parse(fs.readFileSync(path.join(repo, "data/jobs.json"), "utf8")), mountId: "bcl-jobs", ready: ".bcl-job-card" },
      { label: "rentals", pagePath: "/rentals", dataPath: "/data/rentals.json", payload: JSON.parse(fs.readFileSync(path.join(repo, "data/rentals.json"), "utf8")), mountId: "bcl-rentals", ready: ".bcl-rental-card" }
    ];

    for (const surface of surfaces) {
      const run = await boot(browser, surface.pagePath, surface.dataPath, surface.payload, surface.mountId, { width: WIDTHS[WIDTHS.length - 1], height: 960 });
      try {
        await run.page.waitForFunction((selector) => document.querySelectorAll(selector).length > 0, surface.ready, { timeout: 20000 });
        for (const width of WIDTHS) {
          await run.page.setViewportSize({ width, height: 900 });
          await run.page.waitForTimeout(150);
          const measurement = await measureControls(run.page);
          try { assertControls(measurement, surface.label); } catch (error) { failures.push(error.message); }
        }
      } catch (error) {
        failures.push(`${surface.label}: fixture could not be measured: ${error.message}`);
      } finally {
        await run.context.close();
      }
    }
  } finally {
    await browser.close();
  }

  if (failures.length) {
    console.error(`control-labels browser fixture: FAIL (${failures.length})`);
    failures.forEach((message) => console.error(` - ${message}`));
    process.exitCode = 1;
    return;
  }
  console.log("control-labels browser fixture: PASS");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
