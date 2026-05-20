import type { Page } from "playwright";
import type { Product } from "../types.js";
import { amazonProductUrl, getAmazonAssociateTag } from "../amazon-affiliate.js";
import { buildProduct } from "./helpers.js";
import { delay } from "../scrape-delay.js";

/** Primary search: https://www.amazon.com/s?k=downpipe+bmw */
const SEARCH_QUERIES = [
  { q: "downpipe bmw", pages: 3 },
  { q: "BMW catless downpipe", pages: 2 },
  { q: "BMW N55 downpipe turbo", pages: 2 },
];

const DELAY_BETWEEN_QUERIES_MS = 2500;

function searchUrl(query: string): string {
  const params = new URLSearchParams({
    k: query,
    i: "automotive",
    tag: getAmazonAssociateTag(),
  });
  return `https://www.amazon.com/s?${params}`;
}

async function isAmazonBlocked(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const text = document.body?.innerText?.toLowerCase() || "";
    return (
      text.includes("robot check") ||
      text.includes("type the characters you see") ||
      document.title.toLowerCase().includes("sorry")
    );
  });
}

async function extractSearchResults(page: Page) {
  return page.evaluate(() => {
    const results: Array<{
      asin: string;
      title: string;
      price: number | null;
      imageUrl: string | null;
      url: string;
    }> = [];
    const seenAsin = new Set<string>();

    const cards = document.querySelectorAll(
      '[data-component-type="s-search-result"], div.s-result-item[data-asin]'
    );

    for (let i = 0; i < cards.length; i++) {
      const el = cards[i];
      const asin = el.getAttribute("data-asin");
      if (!asin || asin.length < 8 || seenAsin.has(asin)) continue;

      const h2 = el.querySelector("h2");
      const title =
        h2?.innerText?.trim() ||
        el.querySelector("h2 span")?.textContent?.trim() ||
        el.querySelector(".a-text-normal")?.textContent?.trim() ||
        "";
      if (!title || title.length < 10) continue;

      let price: number | null = null;
      const priceWhole = el.querySelector(".a-price-whole");
      const priceFrac = el.querySelector(".a-price-fraction");
      if (priceWhole) {
        const whole = (priceWhole.textContent || "").replace(/[^0-9]/g, "");
        const frac = (priceFrac?.textContent || "00").replace(/[^0-9]/g, "");
        price = parseFloat(`${whole}.${frac || "00"}`);
      } else {
        const offscreen = el.querySelector(".a-offscreen");
        const m = offscreen?.textContent?.replace(/,/g, "").match(/[\d.]+/);
        if (m) price = parseFloat(m[0]);
      }

      const img = el.querySelector(
        "img.s-image, img[data-image-latency]"
      ) as HTMLImageElement | null;
      const link = el.querySelector(
        "h2 a, a.a-link-normal.s-line-clamp-2"
      ) as HTMLAnchorElement | null;
      const href = link?.href || `https://www.amazon.com/dp/${asin}`;

      seenAsin.add(asin);
      results.push({
        asin,
        title,
        price,
        imageUrl: img?.src || img?.getAttribute("src") || null,
        url: href,
      });
    }

    return results;
  });
}

async function scrollResults(page: Page) {
  await page.evaluate(async () => {
    const step = 500;
    const max = Math.min(document.body.scrollHeight, 4500);
    for (let y = 0; y < max; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 50));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(600);
}

async function goToNextResultsPage(page: Page): Promise<boolean> {
  const next = page.locator(
    "a.s-pagination-next:not(.s-pagination-disabled), .s-pagination-next:not(.s-pagination-disabled) a"
  );
  if ((await next.count()) === 0) return false;
  await next.first().click();
  await page.waitForTimeout(2500);
  return true;
}

export async function scrapeAmazon(page: Page): Promise<Product[]> {
  const products: Product[] = [];
  const seen = new Set<string>();

  for (let qi = 0; qi < SEARCH_QUERIES.length; qi++) {
    const { q: query, pages: maxPages } = SEARCH_QUERIES[qi];
    if (qi > 0) await delay(DELAY_BETWEEN_QUERIES_MS);

    try {
      await page.goto(searchUrl(query), {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await page
        .waitForSelector('[data-component-type="s-search-result"]', {
          timeout: 15000,
        })
        .catch(() => {});

      if (await isAmazonBlocked(page)) {
        console.error(`[amazon] blocked on query "${query}"`);
        continue;
      }
    } catch {
      continue;
    }

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      if (pageNum > 1 && !(await goToNextResultsPage(page))) break;
      if (await isAmazonBlocked(page)) break;

      await scrollResults(page);

      let items: Awaited<ReturnType<typeof extractSearchResults>> = [];
      try {
        items = await extractSearchResults(page);
      } catch {
        break;
      }

      for (const item of items) {
        if (seen.has(item.asin)) continue;
        seen.add(item.asin);

        const product = buildProduct({
          source: "amazon",
          externalId: item.asin,
          title: item.title,
          url: amazonProductUrl(item.asin),
          price: item.price,
          imageUrl: item.imageUrl,
          partNumber: item.asin,
        });

        if (product) products.push(product);
      }
    }
  }

  return products;
}
