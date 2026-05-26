import type { Page } from "playwright";
import type { Product } from "../types.js";
import { buildProduct, parseUsdPrice } from "./helpers.js";
import { normalizeImageUrl } from "./image-url.js";
import { evaluateBrowserFunction, waitPastChallenge } from "./browser.js";
import { delay } from "../scrape-delay.js";
import {
  isTurnerPlaceholderImage,
  isTurnerProductImage,
} from "./turner-images.js";
import {
  cacheTurnerImage,
  cacheTurnerImageFromPage,
  getLocalTurnerImagePath,
} from "../turner-image-cache.js";

const TURNER_BASE = "https://www.turnermotorsport.com";

const TURNER_URLS = [
  `${TURNER_BASE}/c-807-bmw-downpipes`,
  `${TURNER_BASE}/search?keywords=bmw+downpipe`,
];

/** Minimum plausible Turner downpipe price (filters "$49 shipping", "$5/mo", etc.). */
const TURNER_MIN_PRICE = 50;

/** All USD amounts in text; ignores "5%" because there is no dollar sign on the 5. */
export function parseTurnerDollarAmounts(text: string): number[] {
  const amounts: number[] = [];
  const re = /\$\s*([\d,]+(?:\.\d{1,2})?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = parseFloat(m[1].replace(/,/g, ""));
    if (!Number.isNaN(n)) amounts.push(n);
  }
  return amounts;
}

/** Pick the main product price (largest $ amount above threshold). */
export function parseTurnerPrice(text: string): number | null {
  if (!text || !/\$/.test(text)) return null;
  const amounts = parseTurnerDollarAmounts(text).filter(
    (n) => n >= TURNER_MIN_PRICE
  );
  if (amounts.length) return Math.max(...amounts);
  return parseUsdPrice(text);
}

type TurnerPdpData = {
  priceText: string;
  imageUrl: string | null;
  blocked: boolean;
};

async function fetchTurnerProductPage(
  page: Page,
  productUrl: string
): Promise<TurnerPdpData | null> {
  try {
    await page.goto(productUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await waitPastChallenge(page, 12000);
    await page.waitForTimeout(800);

    return evaluateBrowserFunction(page, readTurnerPdpInBrowser, TURNER_MIN_PRICE);
  } catch {
    return null;
  }
}

async function cacheTurnerProductPage(
  page: Page,
  productUrl: string,
  productId: string
): Promise<{ imagePath: string | null; priceText: string }> {
  const existing = getLocalTurnerImagePath(productId);
  const data = await fetchTurnerProductPage(page, productUrl);
  if (!data || data.blocked) {
    return { imagePath: existing, priceText: "" };
  }

  if (existing) {
    return { imagePath: existing, priceText: data.priceText };
  }

  const normalized = normalizeImageUrl(data.imageUrl, TURNER_BASE);
  if (normalized && isTurnerProductImage(normalized)) {
    const cached = await cacheTurnerImage(page, normalized, productId);
    if (cached) return { imagePath: cached, priceText: data.priceText };
  }

  const screenshot = await cacheTurnerImageFromPage(page, productId);
  return { imagePath: screenshot, priceText: data.priceText };
}

/** Read sale price from a Turner PDP (used by fix-turner-prices script). */
export async function scrapeTurnerProductPrice(
  page: Page,
  productUrl: string
): Promise<number | null> {
  const data = await fetchTurnerProductPage(page, productUrl);
  if (!data || data.blocked) return null;
  return parseTurnerPrice(data.priceText);
}

export async function scrapeTurner(page: Page): Promise<Product[]> {
  const products: Product[] = [];
  const seen = new Set<string>();

  for (const url of TURNER_URLS) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
      await waitPastChallenge(page, 45000);
      await page.evaluate(async () => {
        const step = 400;
        const max = document.body.scrollHeight;
        for (let y = 0; y < max; y += step) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 80));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(1500);

      const items = await evaluateBrowserFunction(
        page,
        scrapeTurnerListInBrowser,
        TURNER_MIN_PRICE
      );

      for (const item of items) {
        if (seen.has(item.href)) continue;
        seen.add(item.href);

        const product = buildProduct({
          source: "turner",
          externalId: item.sku,
          title: item.title,
          url: item.href,
          price: parseTurnerPrice(item.priceText),
          imageUrl: null,
          partNumber: item.sku,
        });

        if (product) products.push(product);
      }
    } catch (err) {
      console.error(
        `[turner] ${url}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return enrichTurnerFromPdp(page, products);
}

function turnerPriceLooksWrong(price: number | null): boolean {
  return price == null || price < 80;
}

async function enrichTurnerFromPdp(
  page: Page,
  products: Product[]
): Promise<Product[]> {
  const max = Number(process.env.TURNER_PDP_ENRICH_MAX) || 80;
  let visits = 0;

  // Fix bad list/search prices before spending visits on images only.
  const ordered = [
    ...products.filter((p) => turnerPriceLooksWrong(p.price)),
    ...products.filter((p) => !turnerPriceLooksWrong(p.price)),
  ];

  for (const product of ordered) {
    const local = getLocalTurnerImagePath(product.id);
    const needsImage = !local;
    const needsPrice = turnerPriceLooksWrong(product.price);

    if (local) product.imageUrl = local;
    if (!needsImage && !needsPrice) continue;
    if (visits >= max) break;

    const { imagePath, priceText } = await cacheTurnerProductPage(
      page,
      product.url,
      product.id
    );

    if (imagePath) {
      product.imageUrl = imagePath;
    }

    const pdpPrice = parseTurnerPrice(priceText);
    if (pdpPrice != null) {
      product.price = pdpPrice;
    }

    visits++;
    if (needsImage && imagePath) {
      console.log(`[turner] cached ${product.partNumber}`);
    } else if (needsPrice && pdpPrice != null) {
      console.log(`[turner] price ${product.partNumber} → $${pdpPrice}`);
    }

    await delay(350);
  }

  return products;
}

function readTurnerPdpInBrowser(minPrice: number): TurnerPdpData {
  function extractTurnerPriceText(scope: ParentNode | null): string {
    if (!scope) return "";
    const bad = /old|was|msrp|strike|map-price|retail|original/i;

    const amountsFromText = (text: string): number[] => {
      const out: number[] = [];
      const re = /\$\s*([\d,]+(?:\.\d{1,2})?)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const n = parseFloat(m[1].replace(/,/g, ""));
        if (!Number.isNaN(n)) out.push(n);
      }
      return out;
    };

    const bestFromElements = (els: NodeListOf<Element>): number => {
      let best = 0;
      for (const el of els) {
        if (bad.test(el.className?.toString() || "")) continue;
        for (const n of amountsFromText(el.textContent || "")) {
          if (n > best) best = n;
        }
      }
      return best;
    };

    for (const sel of [".product-price", ".big-price", ".price"]) {
      const best = bestFromElements(scope.querySelectorAll(sel));
      if (best >= minPrice) return `$${best}`;
    }

    const data = scope.querySelector("[data-price-amount]");
    if (data) {
      const v = parseFloat(data.getAttribute("data-price-amount") || "");
      if (!Number.isNaN(v) && v >= minPrice) return `$${v}`;
    }

    const meta = scope.querySelector('[itemprop="price"]');
    if (meta) {
      const raw = meta.getAttribute("content") || meta.textContent || "";
      const nums = amountsFromText(raw.includes("$") ? raw : `$${raw}`);
      if (nums.length) {
        const best = Math.max(...nums);
        if (best >= minPrice) return `$${best}`;
      }
    }

    return "";
  }

  const blocked =
    document.body.innerText.toLowerCase().includes("robot check") ||
    document.title.toLowerCase().includes("blocked");
  const priceText = extractTurnerPriceText(document);

  const og = document
    .querySelector('meta[property="og:image"]')
    ?.getAttribute("content");
  let imageUrl = og && og.includes("product_library") ? og : null;
  if (!imageUrl) {
    for (const img of document.querySelectorAll("img")) {
      const src =
        img.currentSrc || img.src || img.getAttribute("data-src") || "";
      if (src.includes("product_library_tms") && !src.includes("no_image")) {
        imageUrl = src;
        break;
      }
    }
  }

  return { priceText, imageUrl, blocked };
}

function scrapeTurnerListInBrowser(minPrice: number): Array<{
  title: string;
  href: string;
  priceText: string;
  sku: string;
}> {
  function extractTurnerPriceText(scope: ParentNode | null): string {
    if (!scope) return "";
    const bad = /old|was|msrp|strike|map-price|retail|original/i;

    const amountsFromText = (text: string): number[] => {
      const out: number[] = [];
      const re = /\$\s*([\d,]+(?:\.\d{1,2})?)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const n = parseFloat(m[1].replace(/,/g, ""));
        if (!Number.isNaN(n)) out.push(n);
      }
      return out;
    };

    const bestFromElements = (els: NodeListOf<Element>): number => {
      let best = 0;
      for (const el of els) {
        if (bad.test(el.className?.toString() || "")) continue;
        for (const n of amountsFromText(el.textContent || "")) {
          if (n > best) best = n;
        }
      }
      return best;
    };

    for (const sel of [".product-price", ".big-price", ".price"]) {
      const best = bestFromElements(scope.querySelectorAll(sel));
      if (best >= minPrice) return `$${best}`;
    }

    const data = scope.querySelector("[data-price-amount]");
    if (data) {
      const v = parseFloat(data.getAttribute("data-price-amount") || "");
      if (!Number.isNaN(v) && v >= minPrice) return `$${v}`;
    }

    const meta = scope.querySelector('[itemprop="price"]');
    if (meta) {
      const raw = meta.getAttribute("content") || meta.textContent || "";
      const nums = amountsFromText(raw.includes("$") ? raw : `$${raw}`);
      if (nums.length) {
        const best = Math.max(...nums);
        if (best >= minPrice) return `$${best}`;
      }
    }

    return "";
  }

  const results: Array<{
    title: string;
    href: string;
    priceText: string;
    sku: string;
  }> = [];
  const seenHref = new Set<string>();

  const pushItem = (card: Element, anchor: HTMLAnchorElement) => {
    const href = (anchor.href || "").split("?")[0];
    if (!href.includes("/p-") || seenHref.has(href)) return;

    const titleEl =
      anchor.querySelector("h5, h2, h3") ||
      card.querySelector("h5, h2, h3, .product-title");

    const title = (titleEl?.textContent || anchor.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
    if (title.length < 12) return;

    const priceText = extractTurnerPriceText(card);
    if (!priceText) return;

    const partId = href.match(/\/p-(\d+)/)?.[1] || "";
    seenHref.add(href);
    results.push({ title, href, priceText, sku: partId });
  };

  for (const card of document.querySelectorAll(".product-item")) {
    const anchor = card.querySelector<HTMLAnchorElement>('a[href*="/p-"]');
    if (anchor) pushItem(card, anchor);
  }

  for (const anchor of document.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/p-"]'
  )) {
    const href = (anchor.href || "").split("?")[0];
    if (!href.includes("/p-") || seenHref.has(href)) continue;
    if (anchor.closest(".product-item")) continue;

    const row =
      anchor.closest("li") ||
      anchor.closest("[class*='product']") ||
      anchor.parentElement?.parentElement;
    if (!row) continue;

    if (!extractTurnerPriceText(row)) continue;
    pushItem(row, anchor);
  }

  return results;
}
