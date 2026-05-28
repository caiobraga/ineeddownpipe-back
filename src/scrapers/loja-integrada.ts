import type { Product, ProductSource } from "../types.js";
import { buildProduct } from "./helpers.js";
import { isDownpipeProduct } from "./utils.js";

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
};

export interface LojaIntegradaConfig {
  source: ProductSource;
  baseUrl: string;
  categoryPath: string;
  maxPages: number;
  brand: string;
  /** When true, only keep BMW / Mini platform listings. */
  bmwOnly?: boolean;
}

const BMW_TITLE =
  /\bbmw\b|\bmini\s*cooper\b|\bb48\b|\bb58\b|\bn55\b|\bn20\b|\bn26\b|\bn13\b|\bs55\b|\bs58\b|\bf20\b|\bf22\b|\bf30\b|\bf32\b|\bf80\b|\bf87\b|\bg20\b|\bg22\b|\bg80\b|\bm135\b|\bm235\b|\bm2\b|\bm3\b|\bm4\b|\b335i\b|\b340i\b|\b435i\b|\b228i\b|\b320i\b|\b328i\b|\b330i\b|\b430i\b|\b135i\b/i;

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

function extractListingImage(chunk: string): string | null {
  const imgTag =
    chunk.match(/<img[^>]*class="imagem-principal"[^>]*>/i)?.[0] ??
    chunk.match(/<img[^>]*>/i)?.[0];
  if (!imgTag) return null;

  const dataSrc = imgTag.match(/data-imagem-caminho="([^"]+)"/i)?.[1];
  const src = imgTag.match(/\ssrc="([^"]+)"/i)?.[1];
  return dataSrc ?? src ?? null;
}

function parseListingPage(html: string, config: LojaIntegradaConfig): Product[] {
  const products: Product[] = [];
  const seen = new Set<string>();

  const itemRegex =
    /<div class="listagem-item[^"]*" data-id="(\d+)"[\s\S]*?(?=<div class="listagem-item|<\/ul>\s*<\/div>\s*<\/div>\s*<div class="paginacao|$)/gi;

  let block: RegExpExecArray | null;
  while ((block = itemRegex.exec(html)) !== null) {
    const chunk = block[0];
    const externalId = block[1];

    const urlMatch = chunk.match(
      /<a href="(https?:\/\/[^"]+)" class="nome-produto[^"]*">([^<]+)<\/a>/i
    );
    if (!urlMatch) continue;

    const url = urlMatch[1];
    const title = decodeHtml(urlMatch[2].trim());
    if (seen.has(url)) continue;
    seen.add(url);

    if (!isDownpipeProduct(title)) continue;
    if (config.bmwOnly && !isBmwListing(title)) continue;

    const priceMatch = chunk.match(/data-sell-price="([\d.]+)"/);
    const price = priceMatch ? parseFloat(priceMatch[1]) : null;

    const imageUrl = extractListingImage(chunk);

    const skuMatch = chunk.match(/<div class="produto-sku[^"]*">\s*([^<\s]+)/i);

    const product = buildProduct({
      source: config.source,
      externalId,
      title,
      url,
      price,
      currency: "BRL",
      imageUrl,
      brand: config.brand,
      partNumber: skuMatch?.[1],
      inStock: true,
    });

    if (product) products.push(product);
  }

  return products;
}

export async function scrapeLojaIntegrada(
  config: LojaIntegradaConfig
): Promise<Product[]> {
  const all: Product[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= config.maxPages; page++) {
    const suffix = page === 1 ? "" : `?pagina=${page}`;
    const url = `${config.baseUrl}${config.categoryPath}${suffix}`;
    const res = await fetch(url, { headers: FETCH_HEADERS });
    if (!res.ok) {
      throw new Error(`${config.source} HTTP ${res.status} (${url})`);
    }

    const html = await res.text();
    const items = parseListingPage(html, config);
    if (items.length === 0 && page > 1) break;

    for (const p of items) {
      if (seen.has(p.url)) continue;
      seen.add(p.url);
      all.push(p);
    }
  }

  return all;
}
