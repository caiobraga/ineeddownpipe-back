import type { Product, ProductSource } from "../types.js";
import { buildProduct } from "./helpers.js";
import { normalizeImageUrl } from "./image-url.js";
import { delay } from "../scrape-delay.js";

interface SuggestProduct {
  id: number;
  title: string;
  handle: string;
  price?: string;
  price_min?: string;
  image?: string;
  url?: string;
  available?: boolean;
}

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "application/json",
};

async function fetchSuggestProducts(
  baseUrl: string,
  searchQuery: string,
  limit = 30
): Promise<SuggestProduct[]> {
  const params = new URLSearchParams({
    q: searchQuery,
    "resources[type]": "product",
    "resources[limit]": String(limit),
  });
  const res = await fetch(`${baseUrl}/search/suggest.json?${params}`, {
    headers: FETCH_HEADERS,
  });
  if (!res.ok) return [];
  try {
    const data = (await res.json()) as {
      resources?: { results?: { products?: SuggestProduct[] } };
    };
    return data.resources?.results?.products ?? [];
  } catch {
    return [];
  }
}

function parsePrice(p: SuggestProduct): number | null {
  const raw = p.price_min ?? p.price;
  if (!raw) return null;
  const n = parseFloat(String(raw).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export async function scrapeShopifyStore(
  baseUrl: string,
  source: ProductSource,
  searchQueries = ["bmw downpipe", "bmw turbo downpipe"],
  limitPerQuery = 30
): Promise<Product[]> {
  const products: Product[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < searchQueries.length; i++) {
    if (i > 0) await delay();

    const items = await fetchSuggestProducts(
      baseUrl,
      searchQueries[i],
      limitPerQuery
    );

    for (const item of items) {
      if (!item.handle || seen.has(item.handle)) continue;
      if (!item.title) continue;

      const product = buildProduct({
        source,
        externalId: String(item.id || item.handle),
        title: item.title,
        url: `${baseUrl}/products/${item.handle}`,
        price: parsePrice(item),
        imageUrl: normalizeImageUrl(item.image, baseUrl),
        partNumber: item.handle,
        inStock: item.available ?? true,
      });

      if (product) {
        seen.add(item.handle);
        products.push(product);
      }
    }
  }

  return products;
}
