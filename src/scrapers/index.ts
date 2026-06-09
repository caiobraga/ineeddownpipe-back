import type { Product, ProductSource, ScrapeResult } from "../types.js";
import { scrapeAmazon } from "./amazon.js";
import { scrapeArm } from "./arm.js";
import { scrapeBimmerWorld } from "./bimmerworld.js";
import { scrapeInd } from "./ind.js";
import { scrapeNovaRacing } from "./novaracing.js";
import { scrapeTurboBrothers } from "./turbobrothers.js";
import { scrapeEurosport } from "./eurosport.js";
import { scrapeVrsf } from "./vrsf.js";
import { launchBrowser, newContext } from "./browser.js";
import { passesDownpipeFilter } from "./utils.js";
import { loadProducts, saveProducts } from "../store.js";
import seedProducts from "../data/seed.json" with { type: "json" };

function onlyDownpipes(products: Product[]): Product[] {
  return products.filter((p) => passesDownpipeFilter(p.title, p.source));
}

/** Keep prior data for sources that failed or returned nothing this run. */
function mergeWithExistingCatalog(
  scraped: Product[],
  results: ScrapeResult[]
): Product[] {
  const filtered = onlyDownpipes(scraped);
  const failedSources = new Set(
    results
      .filter((r) => r.count === 0 || r.error)
      .map((r) => r.source)
  );

  if (failedSources.size === 0) return filtered;

  const existing = onlyDownpipes(loadProducts());
  const kept = existing.filter((p) => failedSources.has(p.source));
  const byId = new Map<string, Product>();
  for (const p of kept) byId.set(p.id, p);
  for (const p of filtered) byId.set(p.id, p);
  return [...byId.values()];
}

type ScraperJob =
  | { source: ProductSource; needsBrowser: false; run: () => Promise<Product[]> }
  | {
      source: ProductSource;
      needsBrowser: true;
      run: (page: import("playwright").Page) => Promise<Product[]>;
    };

const SCRAPERS: ScraperJob[] = [
  { source: "bimmerworld", needsBrowser: false, run: scrapeBimmerWorld },
  { source: "ind", needsBrowser: false, run: scrapeInd },
  { source: "arm", needsBrowser: false, run: scrapeArm },
  { source: "novaracing", needsBrowser: false, run: scrapeNovaRacing },
  { source: "turbobrothers", needsBrowser: false, run: scrapeTurboBrothers },
  { source: "eurosport", needsBrowser: false, run: scrapeEurosport },
  { source: "vrsf", needsBrowser: false, run: scrapeVrsf },
  ...(process.env.SKIP_AMAZON_SCRAPE === "true" ||
  process.env.SKIP_AMAZON_SCRAPE === "1"
    ? []
    : [{ source: "amazon" as const, needsBrowser: true as const, run: scrapeAmazon }]),
];

export const SCRAPER_SOURCES: ProductSource[] = SCRAPERS.map((job) => job.source);

export async function runAllScrapers(): Promise<{
  products: Product[];
  results: ScrapeResult[];
}> {
  const results: ScrapeResult[] = [];
  let allProducts: Product[] = [];

  const fetchScrapers = SCRAPERS.filter((s) => !s.needsBrowser);
  const browserScrapers = SCRAPERS.filter((s) => s.needsBrowser);

  for (const job of fetchScrapers) {
    try {
      const items = await job.run();
      allProducts.push(...items);
      results.push({ source: job.source, count: items.length });
    } catch (err) {
      results.push({
        source: job.source,
        count: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  let browser;
  try {
    if (browserScrapers.length === 0) {
      // Amazon scrape skipped via SKIP_AMAZON_SCRAPE
    } else {
    browser = await launchBrowser();
    const context = await newContext(browser);
    for (const job of browserScrapers) {
      const page = await context.newPage();
      try {
        const items = await job.run(page);
        allProducts.push(...items);
        results.push({ source: job.source, count: items.length });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[scrape] ${job.source} failed:`, message);
        results.push({
          source: job.source,
          count: 0,
          error: message,
        });
      } finally {
        await page.close().catch(() => {});
      }
    }

    await context.close();
    }
  } catch (err) {
    results.push({
      source: "amazon",
      count: 0,
      error: `Browser: ${err instanceof Error ? err.message : String(err)}`,
    });
  } finally {
    await browser?.close();
  }

  if (allProducts.length === 0) {
    const existing = onlyDownpipes(loadProducts());
    if (existing.length > 0) {
      allProducts = existing;
    } else {
      allProducts = onlyDownpipes(seedProducts as Product[]);
      results.push({
        source: "bimmerworld",
        count: 0,
        error: "Scrape failed — using filtered seed data",
      });
    }
  } else {
    allProducts = mergeWithExistingCatalog(allProducts, results);
    const byId = new Map<string, Product>();
    for (const p of allProducts) byId.set(p.id, p);
    saveProducts([...byId.values()]);
  }

  return { products: allProducts, results };
}
