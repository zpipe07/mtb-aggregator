// Temporary ZAC-297 repro: sort changes on /deals/c/components/suspension/forks.
// Usage: node scripts/zac297/repro.mjs [iterations] [baseUrl] [--headed] [--slow3g]
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, "../../apps/scraper/package.json"));
const { chromium } = require("playwright");

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const iterations = Number(args[0] ?? 10);
const base = args[1] ?? "http://localhost:3002";
const startPath =
  "/deals/c/components/suspension/forks?spec_travel=203&spec_travel=200";
const SORTS = ["price_asc", "price_desc", "discount", "newest"];
const HANG_MS = 5_000;
const MAX_WAIT_MS = 20_000;
const IDLE_MS = Number(process.env.IDLE_MS ?? 5_000);

const browser = await chromium.launch({ channel: "chrome", headless: !flags.has("--headed") });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

if (flags.has("--slow3g")) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 400,
    downloadThroughput: (500 * 1024) / 8,
    uploadThroughput: (500 * 1024) / 8,
  });
}

async function loadStart() {
  if (flags.has("--user-flow")) {
    await page.goto(base + "/deals/c/components/suspension/forks", { waitUntil: "load", timeout: 60_000 });
    await page.waitForSelector("#sort-select");
    await page.waitForTimeout(1500);
    await page.locator("aside label", { hasText: /^\s*203/ }).first().click();
    await page.waitForTimeout(2000);
    await page.locator("aside label", { hasText: /^\s*200/ }).first().click();
    await page.waitForFunction(
      () =>
        new URL(location.href).searchParams.getAll("spec_travel").length === 2 &&
        document.querySelector("[aria-busy]")?.getAttribute("aria-busy") !== "true",
      null,
      { timeout: 30_000 },
    );
    await page.waitForTimeout(IDLE_MS);
  } else {
    await page.goto(base + startPath, { waitUntil: "load", timeout: 60_000 });
    await page.waitForSelector("#sort-select");
    await page.waitForTimeout(1500);
  }
}

const results = [];
for (let i = 0; i < iterations; i++) {
  if (i === 0 || !flags.has("--stay")) await loadStart();
  if (flags.has("--burst")) {
    const burstTargets = [];
    for (let n = 0; n < 6; n++) {
      const current = await page.$eval("#sort-select", (el) => el.value);
      const target = SORTS.filter((s) => s !== current)[n % 3];
      burstTargets.push(target);
      await page.evaluate(() => {
        if (!window.__t0) window.__t0 = performance.now();
      });
      await page.selectOption("#sort-select", target);
      await page.waitForTimeout(150);
    }
    const target = burstTargets.at(-1);
    const outcome = await page.evaluate(
      async ({ target, maxWait }) => {
        const t0 = window.__t0;
        const busy = () =>
          document.querySelector("[aria-busy]")?.getAttribute("aria-busy") === "true";
        let sawBusy = false;
        while (performance.now() - t0 < maxWait) {
          if (busy()) sawBusy = true;
          const committed = new URL(location.href).searchParams.get("sort") === target;
          if (committed && !busy()) {
            return { committedMs: Math.round(performance.now() - t0), sawBusy };
          }
          await new Promise((r) => setTimeout(r, 25));
        }
        return { committedMs: null, sawBusy, href: location.href };
      },
      { target, maxWait: MAX_WAIT_MS },
    );
    const hung = outcome.committedMs === null || outcome.committedMs > HANG_MS;
    console.log(
      `#${i} burst last=${target} committed=${outcome.committedMs ?? "NEVER"}ms busy=${outcome.sawBusy}` +
        (hung ? "  <-- HANG" : ""),
    );
    if (hung) console.log("  href:", outcome.href);
    results.push({ hung, committedMs: outcome.committedMs });
    await page.evaluate(() => {
      window.__t0 = 0;
    });
    continue;
  }
  const current = await page.$eval("#sort-select", (el) => el.value);
  const candidates = SORTS.filter((s) => s !== current);
  const target = candidates[i % candidates.length];

  await page.evaluate(() => {
    window.__navLog = [];
    window.__t0 = performance.now();
  });
  await page.selectOption("#sort-select", target);

  const outcome = await page.evaluate(
    async ({ target, maxWait }) => {
      const t0 = window.__t0;
      const busy = () =>
        document.querySelector("[aria-busy]")?.getAttribute("aria-busy") === "true";
      let sawBusy = false;
      while (performance.now() - t0 < maxWait) {
        if (busy()) sawBusy = true;
        const committed = new URL(location.href).searchParams.get("sort") === target;
        if (committed && !busy()) {
          return { committedMs: Math.round(performance.now() - t0), sawBusy };
        }
        await new Promise((r) => setTimeout(r, 25));
      }
      return { committedMs: null, sawBusy };
    },
    { target, maxWait: MAX_WAIT_MS },
  );

  const detail = await page.evaluate((t0) => {
    const rsc = performance
      .getEntriesByType("resource")
      .filter((e) => e.name.includes("_rsc=") && e.startTime >= window.__t0 - 50)
      .map((e) => ({
        start: Math.round(e.startTime - window.__t0),
        end: Math.round(e.responseEnd - window.__t0),
        url: new URL(e.name).pathname + new URL(e.name).search.replace(/&?_rsc=[^&]*/, ""),
      }));
    const nav = (window.__navLog || []).map((e) => ({ ...e, t: e.t - Math.round(window.__t0) }));
    return { rsc, nav, bufferFull: performance.getEntriesByType("resource").length };
  });

  const rscEnd = detail.rsc.reduce((max, e) => Math.max(max, e.end), null);
  const gap =
    outcome.committedMs != null && rscEnd != null ? outcome.committedMs - rscEnd : null;
  const hung = outcome.committedMs === null || outcome.committedMs > HANG_MS;
  results.push({ i, target, ...outcome, hung, rscEnd, gap });
  console.log(
    `#${i} sort=${target} committed=${outcome.committedMs ?? "NEVER"}ms rscEnd=${rscEnd ?? "none"} gap=${gap ?? "n/a"}ms busy=${outcome.sawBusy}` +
      (hung ? "  <-- HANG" : ""),
  );
  if (hung || flags.has("--verbose")) {
    console.log("  rsc:", JSON.stringify(detail.rsc));
    console.log("  navq:", JSON.stringify(detail.nav));
    console.log("  resourceEntries:", detail.bufferFull);
  }
}

const hangs = results.filter((r) => r.hung).length;
const times = results.filter((r) => r.committedMs != null).map((r) => r.committedMs).sort((a, b) => a - b);
console.log(
  `\n${hangs}/${results.length} hung; commit ms p50=${times[Math.floor(times.length / 2)]} max=${times.at(-1)}`,
);
await browser.close();
