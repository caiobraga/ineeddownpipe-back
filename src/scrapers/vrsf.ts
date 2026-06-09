import type { Product } from "../types.js";
import { delay } from "../scrape-delay.js";
import { buildProduct } from "./helpers.js";
import { isDownpipeProduct } from "./utils.js";

const BASE = "https://www.vr-speed.com";
const API = `${BASE}/wp-json/wc/store/v1/products`;
const EXHAUST_CATEGORY_ID = 74;

const SEARCH_QUERIES = [
  "downpipe",
  "catless downpipe",
  "catted downpipe",
  "racing downpipe",
];

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "application/json",
};

const BMW_TITLE =
  /\bbmw\b|\bmini\s*cooper\b|\bmini\b|\bb48\b|\bb58\b|\bn55\b|\bn54\b|\bn20\b|\bn26\b|\bn63\b|\bs55\b|\bs58\b|\bs63\b|\bf20\b|\bf22\b|\bf30\b|\bf32\b|\bf80\b|\bf87\b|\bf90\b|\bg20\b|\bg22\b|\bg80\b|\bm135\b|\bm235\b|\bm2\b|\bm3\b|\bm4\b|\bm5\b|\b335i\b|\b340i\b|\b435i\b|\b535i\b|\b640i\b|\b740i\b|\b840i\b|\b135i\b|\br5[67]\b|\bf5[46]\b|\bx3m\b|\bx4m\b|\bx5m\b|\bx6m\b/i;

type WcStoreProduct = {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  sku?: string;
  images?: { src?: string }[];
  is_in_stock?: boolean;
  prices?: {
    price?: string;
    sale_price?: string;
    regular_price?: string;
    currency_minor_unit?: number;
  };
};

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#8211;/g, "–")
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

function parseWcPrice(prices?: WcStoreProduct["prices"]): number | null {
  if (!prices) return null;
  const minor = prices.currency_minor_unit ?? 2;
  const raw = prices.sale_price || prices.price || prices.regular_price;
  if (!raw) return null;
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return null;
  return n / 10 ** minor;
}

function isBmwListing(title: string): boolean {
  return BMW_TITLE.test(title);
}

function productFromWc(row: WcStoreProduct): Product | null {
  const title = decodeHtmlEntities(String(row.name || "").replace(/<[^>]+>/g, "").trim());
  if (!title || !isDownpipeProduct(title) || !isBmwListing(title)) return null;

  const externalId = String(row.sku || row.id || row.slug);
  return buildProduct({
    source: "vrsf",
    externalId,
    title,
    url: row.permalink,
    price: parseWcPrice(row.prices),
    currency: "USD",
    imageUrl: row.images?.[0]?.src ?? null,
    brand: "VRSF",
    partNumber: row.sku,
    inStock: row.is_in_stock !== false,
  });
}

async function fetchWcProducts(params: Record<string, string>): Promise<WcStoreProduct[]> {
  const qs = new URLSearchParams({ per_page: "100", ...params });
  const res = await fetch(`${API}?${qs}`, { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`VRSF API HTTP ${res.status}`);
  const data = (await res.json()) as WcStoreProduct[];
  return Array.isArray(data) ? data : [];
}

export async function scrapeVrsf(): Promise<Product[]> {
  const byUrl = new Map<string, Product>();

  const addRows = (rows: WcStoreProduct[]) => {
    for (const row of rows) {
      const product = productFromWc(row);
      if (product) byUrl.set(product.url, product);
    }
  };

  const categoryRows = await fetchWcProducts({ category: String(EXHAUST_CATEGORY_ID) });
  addRows(categoryRows);

  for (let i = 0; i < SEARCH_QUERIES.length; i++) {
    if (i > 0) await delay();
    const rows = await fetchWcProducts({ search: SEARCH_QUERIES[i]! });
    addRows(rows);
  }

  return [...byUrl.values()];
}
