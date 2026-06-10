import type { Product } from "../types.js";
import { delay } from "../scrape-delay.js";
import { buildProduct } from "./helpers.js";
import { normalizeImageUrl } from "./image-url.js";
import { isDownpipeProduct } from "./utils.js";

const BASE = "https://trucranemotorsports.com";

/** Curated handles — avoids rate limits from scanning all collections.json pages. */
const COLLECTION_HANDLES = [
  "tcm",
  "active-autowerke-downpipes",
  "f30-exhaust",
  "f20-exhaust",
  "g20-exhaust",
  "g80-exhaust",
  "g87-m2-exhaust-m2",
  "f80-exhaust",
  "f90-exhaust",
  "f97-f98-x3m-x4m-exhaust",
  "f95-f96-x5m-x6m-exhaust",
  "e90-exhaust",
  "f10m-exhaust",
  "g42-2-series-exhaust",
  "g30-g15-5-8-series-exhaust",
];

const SEARCH_QUERIES = [
  "bmw downpipe",
  "bmw catless downpipe",
  "tcm downpipe",
];

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "application/json",
};

const HTML_HEADERS = {
  ...FETCH_HEADERS,
  Accept: "text/html,application/xhtml+xml",
};

const COLLECTION_DELAY_MS = Number(process.env.TRUCRANE_COLLECTION_DELAY_MS) || 1200;

const BMW_TITLE =
  /\bbmw\b|\bmini\s*cooper\b|\bmini\b|\bb48\b|\bb58\b|\bn55\b|\bn54\b|\bn20\b|\bn26\b|\bn63\b|\bs55\b|\bs58\b|\bs63\b|\bs68\b|\bf20\b|\bf22\b|\bf30\b|\bf32\b|\bf80\b|\bf87\b|\bf90\b|\bg20\b|\bg22\b|\bg42\b|\bg80\b|\bg87\b|\bm135\b|\bm235\b|\bm2\b|\bm3\b|\bm4\b|\bm5\b|\b335i\b|\b340i\b|\b435i\b|\b535i\b|\b640i\b|\b740i\b|\b840i\b|\b135i\b|\br5[67]\b|\bf5[46]\b|\bx3m\b|\bx4m\b|\bx5m\b|\bx6m\b/i;

type ShopifyVariant = {
  id?: number;
  price?: string;
  sku?: string;
  available?: boolean;
};

type ShopifyProduct = {
  id: number;
  title: string;
  handle: string;
  vendor?: string;
  variants?: ShopifyVariant[];
  images?: { src?: string }[];
};

type SuggestProduct = {
  id: number;
  title: string;
  handle: string;
  price?: string;
  price_min?: string;
  image?: string;
  available?: boolean;
};

type ParsedCard = {
  handle: string;
  title: string;
  price: number | null;
  imageUrl: string | null;
};

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  retries = 5
): Promise<Response | null> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (res.status === 429) {
        await delay(2500 * attempt);
        continue;
      }
      return res;
    } catch {
      if (attempt === retries) return null;
      await delay(2000 * attempt);
    }
  }
  return null;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const res = await fetchWithRetry(url, FETCH_HEADERS);
  if (!res?.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchText(url: string): Promise<string | null> {
  const res = await fetchWithRetry(url, HTML_HEADERS);
  if (!res?.ok) return null;
  try {
    return await res.text();
  } catch {
    return null;
  }
}

function parsePrice(value?: string): number | null {
  if (!value) return null;
  const n = parseFloat(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function isBmwListing(title: string, collectionHandle?: string): boolean {
  if (BMW_TITLE.test(title)) return true;
  // TCM house-brand collection — titles often lead with "TCM" + engine codes.
  if (collectionHandle === "tcm" && /^tcm\b/i.test(title)) {
    return /\b(bmw|b58|b48|n55|n54|n20|n26|n63|s55|s58|s63|s68|m2|m3|m4|m5|x3m|x4m|x5m|x6m|mini)\b/i.test(
      title
    );
  }
  return false;
}

function productFromShopify(
  row: ShopifyProduct,
  collectionHandle?: string
): Product | null {
  const title = String(row.title || "").trim();
  if (!title || !isDownpipeProduct(title) || !isBmwListing(title, collectionHandle)) {
    return null;
  }

  const variant = row.variants?.[0];
  const externalId = String(variant?.sku || row.id || row.handle);
  const price = parsePrice(variant?.price);
  const inStock = row.variants?.some((v) => v.available !== false) ?? true;

  return buildProduct({
    source: "trucrane",
    externalId,
    title,
    url: `${BASE}/products/${row.handle}`,
    price,
    currency: "USD",
    imageUrl: normalizeImageUrl(row.images?.[0]?.src, BASE),
    brand: row.vendor || "TCM",
    partNumber: variant?.sku,
    inStock,
  });
}

function productFromCard(card: ParsedCard, collectionHandle?: string): Product | null {
  const title = decodeHtmlEntities(card.title);
  if (!title || !isDownpipeProduct(title) || !isBmwListing(title, collectionHandle)) {
    return null;
  }

  return buildProduct({
    source: "trucrane",
    externalId: card.handle,
    title,
    url: `${BASE}/products/${card.handle}`,
    price: card.price,
    currency: "USD",
    imageUrl: normalizeImageUrl(card.imageUrl, BASE),
    brand: /^tcm\b/i.test(title) ? "TCM" : undefined,
    partNumber: card.handle,
    inStock: true,
  });
}

function productFromSuggest(item: SuggestProduct): Product | null {
  const title = String(item.title || "").trim();
  if (!title || !item.handle || !isDownpipeProduct(title) || !isBmwListing(title)) {
    return null;
  }

  const price = parsePrice(item.price_min ?? item.price);
  return buildProduct({
    source: "trucrane",
    externalId: String(item.id || item.handle),
    title,
    url: `${BASE}/products/${item.handle}`,
    price,
    currency: "USD",
    imageUrl: normalizeImageUrl(item.image, BASE),
    partNumber: item.handle,
    inStock: item.available ?? true,
  });
}

function parseCollectionHtml(html: string): ParsedCard[] {
  const cards: ParsedCard[] = [];
  const seen = new Set<string>();

  const headingRe =
    /<h3[^>]*class="[^"]*card__heading[^"]*"[^>]*>[\s\S]*?href="\/products\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;
  while ((match = headingRe.exec(html)) !== null) {
    const handle = match[1]!;
    if (!handle || handle === "gift-card" || seen.has(handle)) continue;

    const title = decodeHtmlEntities(match[2]!.replace(/<[^>]+>/g, ""));
    if (!title) continue;

    const chunk = html.slice(match.index, match.index + 1200);
    const priceMatch = chunk.match(/\$([0-9][0-9.,]+)/);
    const imgMatch = chunk.match(
      /src="(\/\/trucranemotorsports\.com\/cdn\/shop\/[^"]+)"/i
    );

    seen.add(handle);
    cards.push({
      handle,
      title,
      price: priceMatch ? parsePrice(priceMatch[1]) : null,
      imageUrl: imgMatch?.[1] ? `https:${imgMatch[1]}` : null,
    });
  }

  return cards;
}

async function fetchCollectionProductsJson(handle: string): Promise<ShopifyProduct[]> {
  const all: ShopifyProduct[] = [];

  for (let page = 1; page <= 4; page++) {
    const data = await fetchJson<{ products?: ShopifyProduct[] }>(
      `${BASE}/collections/${handle}/products.json?limit=250&page=${page}`
    );
    const rows = data?.products ?? [];
    if (rows.length === 0) break;
    all.push(...rows);
    if (rows.length < 250) break;
    await delay(800);
  }

  return all;
}

async function fetchCollectionProductsHtml(handle: string): Promise<ParsedCard[]> {
  const all: ParsedCard[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= 6; page++) {
    const suffix = page === 1 ? "" : `?page=${page}`;
    const html = await fetchText(`${BASE}/collections/${handle}${suffix}`);
    if (!html) break;

    const cards = parseCollectionHtml(html);
    if (cards.length === 0) break;

    for (const card of cards) {
      if (seen.has(card.handle)) continue;
      seen.add(card.handle);
      all.push(card);
    }

    if (!html.includes("pagination") && page > 1) break;
    if (!/page=\d+/.test(html) && page > 1 && cards.length < 8) break;
    await delay(800);
  }

  return all;
}

async function fetchCollectionProducts(handle: string): Promise<Product[]> {
  const products: Product[] = [];
  const seen = new Set<string>();

  const add = (p: Product | null) => {
    if (p && !seen.has(p.url)) {
      seen.add(p.url);
      products.push(p);
    }
  };

  const jsonRows = await fetchCollectionProductsJson(handle);
  if (jsonRows.length > 0) {
    for (const row of jsonRows) add(productFromShopify(row, handle));
    return products;
  }

  const htmlCards = await fetchCollectionProductsHtml(handle);
  for (const card of htmlCards) add(productFromCard(card, handle));

  return products;
}

async function fetchSuggestProducts(query: string): Promise<SuggestProduct[]> {
  const params = new URLSearchParams({
    q: query,
    "resources[type]": "product",
    "resources[limit]": "30",
  });
  const data = await fetchJson<{
    resources?: { results?: { products?: SuggestProduct[] } };
  }>(`${BASE}/search/suggest.json?${params}`);
  return data?.resources?.results?.products ?? [];
}

export async function scrapeTrucrane(): Promise<Product[]> {
  const byUrl = new Map<string, Product>();

  const addProduct = (p: Product | null) => {
    if (p) byUrl.set(p.url, p);
  };

  for (let i = 0; i < COLLECTION_HANDLES.length; i++) {
    if (i > 0) await delay(COLLECTION_DELAY_MS);
    const items = await fetchCollectionProducts(COLLECTION_HANDLES[i]!);
    for (const p of items) addProduct(p);
  }

  for (let i = 0; i < SEARCH_QUERIES.length; i++) {
    if (i > 0) await delay(COLLECTION_DELAY_MS);
    const items = await fetchSuggestProducts(SEARCH_QUERIES[i]!);
    for (const item of items) addProduct(productFromSuggest(item));
  }

  return [...byUrl.values()];
}
