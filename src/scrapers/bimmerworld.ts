import type { Product } from "../types.js";
import { buildProduct, parseUsdPrice } from "./helpers.js";

const BASE = "https://www.bimmerworld.com";
const LIST_URL = `${BASE}/Exhaust/Downpipes/`;

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
};

function resolveImageUrl(src: string): string {
  const trimmed = src.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http")) return trimmed;
  return `${BASE}${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`;
}

export async function scrapeBimmerWorld(): Promise<Product[]> {
  const res = await fetch(LIST_URL, { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`BimmerWorld HTTP ${res.status}`);

  const html = await res.text();
  const products: Product[] = [];
  const seen = new Set<string>();

  // Image + title + price live in the same product-info cell
  const blockRegex =
    /<a href=['"](\/Exhaust\/Downpipes\/[^'"]+\.html)['"]><img src=['"]([^'"]+)['"][^>]*>[\s\S]*?<h2>([^<]+)<\/h2>[\s\S]*?Price:\s*(?:<[^>]+>)*([^<]*\$[\d,.\s–\-]+)/gi;

  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(html)) !== null) {
    const path = match[1];
    const imageSrc = match[2];
    const title = match[3].trim();
    const priceText = match[4];
    const url = `${BASE}${path}`;
    const externalId = path.split("/").pop()?.replace(".html", "") ?? path;

    if (seen.has(url)) continue;
    seen.add(url);

    const product = buildProduct({
      source: "bimmerworld",
      externalId,
      title,
      url,
      price: parseUsdPrice(priceText),
      imageUrl: resolveImageUrl(imageSrc),
      partNumber: externalId,
      inStock: true,
    });

    if (product) products.push(product);
  }

  // Fallback: products without img in listing (title + link only)
  const fallbackRegex =
    /<div class="product-title">\s*<h2>([^<]+)<\/h2>[\s\S]*?Price:\s*(?:<[^>]+>)*([^<]*\$[\d,.\s–\-]+)[\s\S]*?href="(\/Exhaust\/Downpipes\/[^"]+\.html)"/gi;

  while ((match = fallbackRegex.exec(html)) !== null) {
    const title = match[1].trim();
    const priceText = match[2];
    const path = match[3];
    const url = `${BASE}${path}`;
    if (seen.has(url)) continue;
    seen.add(url);

    const externalId = path.split("/").pop()?.replace(".html", "") ?? path;
    const product = buildProduct({
      source: "bimmerworld",
      externalId,
      title,
      url,
      price: parseUsdPrice(priceText),
      partNumber: externalId,
      inStock: true,
    });
    if (product) products.push(product);
  }

  return products;
}
