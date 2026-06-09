import type { Product } from "../types.js";
import { delay } from "../scrape-delay.js";
import { buildProduct, parseUsdPrice } from "./helpers.js";
import { isDownpipeProduct } from "./utils.js";

const BASE = "https://eurosporttuning.com";
const CATEGORY_PATH = "/exhaust/downpipe/";
const MAX_CATEGORY_PAGES = 8;
const MAX_SEARCH_PAGES = 6;

/** Site search returns full product titles; category listings often truncate. */
const SEARCH_QUERIES = [
  "bmw catless downpipe",
  "bmw catted downpipe",
  "bmw downpipe",
  "mini downpipe",
  "mini cooper downpipe",
  "bmw n55 downpipe",
  "bmw b58 downpipe",
  "bmw n20 downpipe",
  "bmw s55 downpipe",
  "bmw m3 downpipe",
  "bmw m4 downpipe",
];

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
};

const BMW_TITLE =
  /\bbmw\b|\bmini\s*cooper\b|\bmini\b|\bb48\b|\bb58\b|\bn55\b|\bn54\b|\bn20\b|\bn26\b|\bn13\b|\bs55\b|\bs58\b|\bf20\b|\bf22\b|\bf30\b|\bf32\b|\bf80\b|\bf87\b|\bg20\b|\bg22\b|\bg80\b|\bm135\b|\bm235\b|\bm2\b|\bm3\b|\bm4\b|\b335i\b|\b340i\b|\b435i\b|\b228i\b|\b320i\b|\b328i\b|\b330i\b|\b430i\b|\b135i\b|\br5[67]\b|\bf5[46]\b/i;

function isBmwListing(title: string): boolean {
  return BMW_TITLE.test(title);
}

function decodeHtml(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'");
}

function resolveListingTitle(chunk: string, h2Title: string): string {
  const altMatch = chunk.match(/<img[^>]*\balt="([^"]+)"/i);
  const alt = altMatch ? decodeHtml(altMatch[1].trim()) : "";
  const useAlt =
    alt.length > 20 &&
    !/\.(jpe?g|png|webp|gif)$/i.test(alt) &&
    !/^photo\b/i.test(alt) &&
    alt.toLowerCase() !== "primary";
  return useAlt ? alt : h2Title;
}

function parseListingPage(html: string): Product[] {
  const products: Product[] = [];
  const seen = new Set<string>();

  const blockRegex = /<li class="product">[\s\S]*?<\/li>/gi;
  let block: RegExpExecArray | null;

  while ((block = blockRegex.exec(html)) !== null) {
    const chunk = block[0];

    const titleMatch = chunk.match(
      /<h2 class="listItem-title">\s*<a href="([^"]+)"[^>]*>([^<]+)<\/a>/i
    );
    if (!titleMatch) continue;

    const url = titleMatch[1].trim().split("?")[0]!;
    const title = resolveListingTitle(chunk, decodeHtml(titleMatch[2].trim()));
    if (seen.has(url)) continue;
    seen.add(url);

    if (!isDownpipeProduct(title)) continue;
    if (!isBmwListing(title)) continue;

    const priceMatch = chunk.match(/data-product-price-without-tax[^>]*>([^<]+)/i);
    const price = priceMatch ? parseUsdPrice(priceMatch[1]) : null;

    const skuMatch = chunk.match(/SKU#:\s*([^<\s]+)/i);
    const externalId = (skuMatch?.[1] ?? url.split("/").filter(Boolean).pop() ?? title)
      .replace(/[^\w.-]+/g, "-")
      .slice(0, 80);

    const brandMatch = chunk.match(/listItem-brand">Brand:\s*([^<]+)</i);
    const brand = brandMatch ? decodeHtml(brandMatch[1].trim()) : undefined;

    const imgMatch = chunk.match(/<img[^>]*\bsrc="([^"]+)"/i);
    const imageUrl = imgMatch?.[1] ?? null;

    const product = buildProduct({
      source: "eurosport",
      externalId,
      title,
      url,
      price,
      currency: "USD",
      imageUrl,
      brand,
      partNumber: skuMatch?.[1],
      inStock: /In Stock/i.test(chunk),
    });

    if (product) products.push(product);
  }

  return products;
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`EuroSport HTTP ${res.status} (${url})`);
  return res.text();
}

async function scrapeSearchQuery(query: string): Promise<Product[]> {
  const all: Product[] = [];
  const encoded = encodeURIComponent(query);

  for (let page = 1; page <= MAX_SEARCH_PAGES; page++) {
    const suffix =
      page === 1
        ? `?search_query=${encoded}`
        : `?search_query=${encoded}&page=${page}`;
    const url = `${BASE}/search.php${suffix}`;
    const html = await fetchHtml(url);
    const items = parseListingPage(html);
    if (items.length === 0) break;
    all.push(...items);
    await delay();
  }

  return all;
}

async function scrapeCategoryPages(): Promise<Product[]> {
  const all: Product[] = [];

  for (let page = 1; page <= MAX_CATEGORY_PAGES; page++) {
    const suffix = page === 1 ? "" : `?page=${page}`;
    const url = `${BASE}${CATEGORY_PATH}${suffix}`;
    const html = await fetchHtml(url);
    const items = parseListingPage(html);
    if (items.length === 0 && page > 1) break;
    all.push(...items);
    await delay();
  }

  return all;
}

export async function scrapeEurosport(): Promise<Product[]> {
  const byUrl = new Map<string, Product>();

  for (const query of SEARCH_QUERIES) {
    const items = await scrapeSearchQuery(query);
    for (const p of items) byUrl.set(p.url, p);
    await delay();
  }

  const categoryItems = await scrapeCategoryPages();
  for (const p of categoryItems) byUrl.set(p.url, p);

  return [...byUrl.values()];
}
