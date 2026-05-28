import type { Page } from "playwright";
import type { Product } from "../types.js";
import { amazonProductUrl, getAmazonAssociateTag } from "../amazon-affiliate.js";
import { buildProduct } from "./helpers.js";
import { delay } from "../scrape-delay.js";

const DEFAULT_PAGES_PER_QUERY = Number(process.env.AMAZON_PAGES_PER_QUERY || 3);
const MAX_PAGES_PER_QUERY = Math.max(1, Math.min(10, DEFAULT_PAGES_PER_QUERY));
const MAX_QUERY_ATTEMPTS = Math.max(1, Number(process.env.AMAZON_QUERY_RETRIES || 2));
const NAVIGATION_TIMEOUT_MS = Number(process.env.AMAZON_NAV_TIMEOUT_MS || 90000);

const SEARCH_QUERIES = [
  { q: "downpipe bmw", pages: MAX_PAGES_PER_QUERY },
  { q: "BMW catless downpipe", pages: MAX_PAGES_PER_QUERY },
  { q: "BMW N55 downpipe turbo", pages: Math.max(1, Math.min(10, MAX_PAGES_PER_QUERY)) },
  { q: "BMW B58 downpipe", pages: Math.max(1, Math.min(5, MAX_PAGES_PER_QUERY)) },
  { q: "BMW S55 downpipe", pages: Math.max(1, Math.min(5, MAX_PAGES_PER_QUERY)) },
];

const DELAY_BETWEEN_QUERIES_MS = 3500;

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
      text.includes("enter the characters you see") ||
      text.includes("to discuss automated access") ||
      text.includes("automated access to amazon data") ||
      document.title.toLowerCase().includes("sorry") ||
      Boolean(
        document.querySelector(
          'input#captchacharacters, form[action*="validateCaptcha"], img[src*="captcha"]'
        )
      )
    );
  });
}

async function dismissAmazonInterstitial(page: Page): Promise<void> {
  const selectors = [
    'button:has-text("Continue shopping")',
    'input[aria-label="Continue shopping"]',
    'a:has-text("Continue shopping")',
    'button[data-action-type="DISMISS"]',
  ];

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0) {
      await locator.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(800);
      break;
    }
  }
}

async function waitForSearchResults(page: Page): Promise<boolean> {
  const selectors = [
    '[data-component-type="s-search-result"]',
    'div.s-result-item[data-asin]:not([data-asin=""])',
  ];

  for (const selector of selectors) {
    const found = await page
      .waitForSelector(selector, { timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    if (found) return true;
  }

  return false;
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
  const href = await next.first().getAttribute("href").catch(() => null);
  if (!href) return false;
  const nextUrl = href.startsWith("http") ? href : `https://www.amazon.com${href}`;
  await page.goto(nextUrl, {
    waitUntil: "domcontentloaded",
    timeout: NAVIGATION_TIMEOUT_MS,
  });
  await dismissAmazonInterstitial(page);
  await page.waitForTimeout(1200);
  return true;
}

async function scrapeSearchQuery(
  page: Page,
  query: string,
  maxPages: number
): Promise<Product[]> {
  const products: Product[] = [];
  const seen = new Set<string>();
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= MAX_QUERY_ATTEMPTS; attempt++) {
    try {
      await page.goto(searchUrl(query), {
        waitUntil: "domcontentloaded",
        timeout: NAVIGATION_TIMEOUT_MS,
      });
      await dismissAmazonInterstitial(page);

      if (await isAmazonBlocked(page)) {
        throw new Error("blocked by bot protection");
      }

      const hasResults = await waitForSearchResults(page);
      if (!hasResults) {
        throw new Error("search results selector not found");
      }

      for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        if (pageNum > 1 && !(await goToNextResultsPage(page))) break;
        if (await isAmazonBlocked(page)) {
          throw new Error(`blocked on page ${pageNum}`);
        }

        await scrollResults(page);
        const items = await extractSearchResults(page);

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

      return products;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_QUERY_ATTEMPTS) {
        await delay(4000 * attempt);
      }
    }
  }

  if (lastError) {
    console.warn(`[amazon] query "${query}" failed: ${lastError}`);
  }

  return products;
}

export async function scrapeAmazon(page: Page): Promise<Product[]> {
  const products: Product[] = [];
  const seen = new Set<string>();
  const queryErrors: string[] = [];

  for (let qi = 0; qi < SEARCH_QUERIES.length; qi++) {
    const { q: query, pages: maxPages } = SEARCH_QUERIES[qi];
    if (qi > 0) await delay(DELAY_BETWEEN_QUERIES_MS);

    const batch = await scrapeSearchQuery(page, query, maxPages);
    if (batch.length === 0) {
      queryErrors.push(query);
    }

    for (const product of batch) {
      if (seen.has(product.id)) continue;
      seen.add(product.id);
      products.push(product);
    }
  }

  if (products.length === 0) {
    const detail =
      queryErrors.length > 0
        ? `all queries failed (${queryErrors.join(", ")})`
        : "no matching listings";
    console.warn(`[amazon] scrape returned 0 products: ${detail}`);
  } else if (queryErrors.length > 0) {
    console.warn(
      `[amazon] partial scrape: ${products.length} products; failed queries: ${queryErrors.join(", ")}`
    );
  }

  return products;
}
