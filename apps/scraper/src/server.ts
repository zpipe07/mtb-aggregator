import "./bootstrap.js";
import * as Sentry from "@sentry/node";
import { timingSafeEqual } from "node:crypto";
import express from "express";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { runWithBrowser } from "./browser.js";
import { logScraperStorageStateConfig } from "./config.js";
import { getParser, getEnricher, PARSERS, ENRICHERS } from "./parsers/index.js";
import { captureRouteError } from "./sentry-helpers.js";
import { ScrapeRequestSchema, ScrapeResultSchema, EnrichRequestSchema } from "./types.js";

const app = express();
app.use(express.json());

const PORT = process.env.PORT ?? 3000;
const LOGS_DIR = process.env.SCREENSHOT_DIR ?? join(process.cwd(), "logs");

/** When SCRAPER_SERVICE_SECRET is set, require X-Scraper-Secret or Authorization: Bearer (same value as API). */
function scraperServiceAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const secret = String(process.env.SCRAPER_SERVICE_SECRET ?? "").trim();
  if (!secret) {
    return next();
  }
  const fromHeader = req.get("X-Scraper-Secret")?.trim() ?? "";
  const auth = req.get("Authorization") ?? "";
  const fromBearer = auth.replace(/^Bearer\s+/i, "").trim();
  const got = fromHeader || fromBearer;
  const a = Buffer.from(got, "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

app.post("/scrape", scraperServiceAuth, async (req, res) => {
  const parseResult = ScrapeRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: "Invalid request",
      details: parseResult.error.flatten(),
    });
  }

  const { url, store } = parseResult.data;
  console.log(`[scraper] scrape started: store=${store} url=${url}`);
  const parser = getParser(store);

  if (!parser) {
    return res.status(400).json({
      error: `Unknown store: ${store}. Supported parsers: ${Object.keys(PARSERS).sort().join(", ")}`,
    });
  }

  try {
    const rawResults = await parser(url);

    const validated: typeof rawResults = [];
    const errors: string[] = [];

    for (const item of rawResults) {
      const result = ScrapeResultSchema.safeParse(item);
      if (result.success) {
        validated.push(result.data);
      } else {
        errors.push(`Invalid item: ${item.product_name ?? "unknown"} - ${result.error.message}`);
      }
    }

    if (errors.length > 0) {
      console.warn("Validation warnings:", errors.slice(0, 5));
    }

    console.log(`[scraper] scrape completed: store=${store} count=${validated.length}`);
    return res.json(validated);
  } catch (err) {
    console.error("Scrape error:", err);
    captureRouteError(err, { route: "scrape", store, url });

    // Take screenshot on failure (if we have page context - for now just log)
    try {
      await mkdir(LOGS_DIR, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const logPath = join(LOGS_DIR, `scrape-error-${store}-${timestamp}.txt`);
      await writeFile(
        logPath,
        `Error: ${err instanceof Error ? err.message : String(err)}\n\nStack: ${err instanceof Error ? err.stack : ""}`
      );
      console.log("Error logged to", logPath);
    } catch (logErr) {
      console.error("Failed to write error log:", logErr);
    }

    return res.status(500).json({
      error: "Scrape failed",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/enrich", scraperServiceAuth, async (req, res) => {
  const parseResult = EnrichRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: "Invalid request",
      details: parseResult.error.flatten(),
    });
  }

  const { url, store } = parseResult.data;
  console.log(`[scraper] enrich started: store=${store} url=${url}`);
  const enricher = getEnricher(store);

  if (!enricher) {
    return res.status(400).json({
      error: `Unknown store: ${store}. Supported enrichers: ${Object.keys(ENRICHERS).sort().join(", ")}`,
    });
  }

  try {
    const result = await enricher(url);
    console.log(`[scraper] enrich completed: store=${store}`);
    return res.json(result);
  } catch (err) {
    console.error("Enrich error:", err);
    try {
      await mkdir(LOGS_DIR, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const logPath = join(LOGS_DIR, `enrich-error-${store}-${timestamp}.txt`);
      await writeFile(
        logPath,
        `Error: ${err instanceof Error ? err.message : String(err)}\n\nStack: ${err instanceof Error ? err.stack : ""}`
      );
    } catch (logErr) {
      console.error("Failed to write error log:", logErr);
    }
    return res.status(500).json({
      error: "Enrich failed",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// Debug: capture page HTML for selector development (set DEBUG=1)
app.post("/scrape-debug", scraperServiceAuth, async (req, res) => {
  if (process.env.DEBUG !== "1") {
    return res.status(404).send("Set DEBUG=1 to enable");
  }
  const parseResult = ScrapeRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: "Invalid request", details: parseResult.error.flatten() });
  }
  const { url, store } = parseResult.data;
  if (store !== "jensonusa") {
    return res.status(400).json({ error: "Only jensonusa supported for debug" });
  }
  try {
    const result = await runWithBrowser(async (browser) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "load", timeout: 60000 });
      await new Promise((r) => setTimeout(r, 3000));
      const html = await page.content();
      const diagnostics = await page.evaluate(`
      (function() {
        const links = document.querySelectorAll('a[href*="jensonusa.com"]');
        const productLike = Array.from(links).filter(function(a) {
          const p = new URL(a.href).pathname;
          return p.length > 2 && p.indexOf("/clearance") !== 0 && p.indexOf("/sale") !== 0;
        });
        const cards = document.querySelectorAll("article.card, article[data-entity-id], .list-item");
        const firstCard = cards[0];
        let firstCardHtml = "";
        let firstCardData = null;
        if (firstCard) {
          firstCardHtml = firstCard.outerHTML.substring(0, 2000);
          const link = firstCard.querySelector("a[href*='jensonusa.com']");
          firstCardData = {
            hasLink: !!link,
            linkHref: link ? link.href : null,
            dataProductPrice: firstCard.getAttribute("data-product-price"),
            dataEntityId: firstCard.getAttribute("data-entity-id"),
            textSnippet: firstCard.textContent ? firstCard.textContent.substring(0, 300) : null
          };
        }
        return {
          totalLinks: links.length,
          productLikeLinks: productLike.length,
          samplePaths: productLike.slice(0, 5).map(function(a) { return new URL(a.href).pathname; }),
          hasProductCards: document.querySelectorAll("[data-product-id], .product-tile, .list-item").length,
          cardCount: cards.length,
          firstCardHtml: firstCardHtml,
          firstCardData: firstCardData
        };
      })()
    `);
      return { diagnostics, htmlLength: html.length, htmlPreview: html.slice(0, 5000) };
    });
    res.json(result);
  } catch (err) {
    captureRouteError(err, { route: "scrape-debug", store, url });
    res.status(500).json({ error: String(err) });
  }
});

Sentry.setupExpressErrorHandler(app);

app.listen(PORT, () => {
  console.log(`Scraper listening on port ${PORT}`);
  logScraperStorageStateConfig();
  const isProd =
    process.env.NODE_ENV === "production" || String(process.env.RENDER ?? "").toLowerCase() === "true";
  if (isProd && !String(process.env.SCRAPER_SERVICE_SECRET ?? "").trim()) {
    console.warn(
      "[security] SCRAPER_SERVICE_SECRET unset in production: POST /scrape, /enrich, /scrape-debug are unauthenticated"
    );
  }
});
