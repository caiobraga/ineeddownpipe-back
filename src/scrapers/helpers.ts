import type { Product, ProductSource } from "../types.js";
import { passesDownpipeFilter, slugId } from "./utils.js";

export function inferBmwModel(title: string): string {
  const lower = title.toLowerCase();
  if (/g8[027x]|f8[0-9x]|s58|g87 m2/i.test(lower)) return "M2/M3/M4 (G8x / S58)";
  if (/f8[0-9] m[234]|s55|f80|f82|f87/i.test(lower)) return "M2/M3/M4 (F8x / S55)";
  if (/m340|m440|b58tu|b58a|b58|g30.*b58|g20.*340/i.test(lower))
    return "M340i/M440i (B58)";
  if (/n55|335|435|m135|m235|m2 n55/i.test(lower)) return "N55 / F-chassis";
  if (/n20|n26|228|328|428|320i|330i|430i/i.test(lower)) return "N20/N26 / F-chassis";
  if (/b46|b48|g20|g22|230i|330i xdrive/i.test(lower)) return "G20/G22 (B46/B48)";
  if (/n63|550i|650i|m5|m6/i.test(lower)) return "N63 / V8";
  if (/e9[0-9]|e8[0-2]|135i|335i n54/i.test(lower)) return "E-chassis";
  return "BMW";
}

export function inferBrandFromTitle(title: string): string {
  const brands = [
    "Evolution Racewerks",
    "Wagner Performance",
    "Wagner Tuning",
    "Akrapovic",
    "Eisenmann",
    "Supersprint",
    "Active Autowerke",
    "VRSF",
    "CTS Turbo",
    "ARM Motorsports",
    "Pure Turbos",
    "Masata",
    "Genuine BMW",
    "Dinan",
    "Armytrix",
    "Nova Racing",
    "Turbo Brothers",
  ];
  for (const b of brands) {
    if (title.toLowerCase().includes(b.toLowerCase())) return b;
  }
  const first = title.split(/[-–|]/)[0]?.trim();
  return first && first.length < 30 ? first : "Aftermarket";
}

export function parseUsdPrice(text: string): number | null {
  const cleaned = text.replace(/,/g, "");
  const range = cleaned.match(/\$?([\d.]+)\s*[–-]\s*\$?([\d.]+)/);
  if (range) return parseFloat(range[1]);
  const single = cleaned.match(/\$?([\d]+\.?\d*)/);
  return single ? parseFloat(single[1]) : null;
}

export function buildProduct(input: {
  source: ProductSource;
  externalId: string;
  title: string;
  url: string;
  price: number | null;
  currency?: string;
  imageUrl?: string | null;
  model?: string;
  brand?: string;
  partNumber?: string;
  inStock?: boolean;
}): Product | null {
  if (!passesDownpipeFilter(input.title, input.source)) return null;

  return {
    id: slugId(input.source, input.externalId),
    title: input.title.trim(),
    brand: input.brand ?? inferBrandFromTitle(input.title),
    price: input.price,
    currency: input.currency ?? "USD",
    imageUrl: input.imageUrl ?? null,
    url: input.url,
    source: input.source,
    model: input.model ?? inferBmwModel(input.title),
    partNumber: input.partNumber,
    inStock: input.inStock,
    scrapedAt: new Date().toISOString(),
  };
}
