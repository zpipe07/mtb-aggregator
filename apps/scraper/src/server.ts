import express from "express";

const app = express();
app.use(express.json());

const PORT = process.env.PORT ?? 3000;

// Placeholder for Phase 2: will accept { url, store } and return ScrapeResult[]
app.post("/scrape", (_req, res) => {
  res.json([]);
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Scraper listening on port ${PORT}`);
});
