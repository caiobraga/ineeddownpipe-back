import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { Product, ProductFilters } from "./types.js";
import { normalizeImageUrl } from "./scrapers/image-url.js";
import { withAmazonAffiliateTag } from "./amazon-affiliate.js";
import {
  enrichProductFitment,
  getFitmentMeta,
  matchesVehiclePreset,
} from "./fitment.js";
import type { ChassisTag, EngineTag } from "./fitment.js";

const BASE_URLS: Partial<Record<Product["source"], string>> = {
  bimmerworld: "https://www.bimmerworld.com",
  amazon: "https://www.amazon.com",
  ind: "https://ind-distribution.com",
  arm: "https://armmotorsports.com",
  novaracing: "https://www.novaracing.com.br",
  turbobrothers: "https://www.turbobrothers.com.br",
  eurosport: "https://eurosporttuning.com",
  vrsf: "https://www.vr-speed.com",
  trucrane: "https://trucranemotorsports.com",
};

export function normalizeProduct(p: Product): Product {
  const base = BASE_URLS[p.source];
  let imageUrl = normalizeImageUrl(p.imageUrl, base) ?? null;

  const url =
    p.source === "amazon" ? withAmazonAffiliateTag(p.url) : p.url;

  return enrichProductFitment({ ...p, imageUrl, url });
}

function normalizeAll(products: Product[]): Product[] {
  return products.map(normalizeProduct);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const CACHE_FILE = join(DATA_DIR, "products.json");

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

const REMOVED_SOURCES = new Set([
  "turner",
  "maperformance",
  "activeautowerke",
  "erw",
  "r44performance",
]);

function withoutRemovedSources(products: Product[]): Product[] {
  return products.filter((p) => !REMOVED_SOURCES.has(String(p.source)));
}

export function loadProducts(): Product[] {
  ensureDataDir();
  if (!existsSync(CACHE_FILE)) return [];
  try {
    const raw = readFileSync(CACHE_FILE, "utf-8");
    return normalizeAll(withoutRemovedSources(JSON.parse(raw) as Product[]));
  } catch {
    return [];
  }
}

export function saveProducts(products: Product[]) {
  ensureDataDir();
  writeFileSync(
    CACHE_FILE,
    JSON.stringify(normalizeAll(products), null, 2),
    "utf-8"
  );
}

/** Retailer names — titles often use the part brand (VRSF, CTS), not the store name. */
const SOURCE_SEARCH_ALIASES: Partial<Record<Product["source"], string[]>> = {
  bimmerworld: ["bimmerworld", "bimmer world"],
  ind: ["ind distribution", "ind-distribution"],
  arm: ["arm motorsports"],
  novaracing: ["nova racing"],
  turbobrothers: ["turbo brothers"],
  eurosport: ["eurosport", "euro sport", "eurosport tuning", "eurosporttuning"],
  vrsf: ["vrsf", "vr speed", "vr-speed", "vr speed factory"],
  trucrane: ["trucrane", "tru crane", "trucranemotorsports", "tru crane motorsports"],
  amazon: ["amazon"],
  used: ["used", "private seller"],
};

function sourceMatchesSearch(source: Product["source"], q: string): boolean {
  const normalized = q.replace(/\s+/g, " ").trim();
  const compact = normalized.replace(/\s/g, "");
  if (source.replace(/_/g, "").includes(compact) || compact.includes(source)) {
    return true;
  }
  const aliases = SOURCE_SEARCH_ALIASES[source];
  if (!aliases) return false;
  return aliases.some(
    (alias) =>
      normalized.includes(alias) ||
      alias.includes(normalized) ||
      alias.replace(/\s/g, "").includes(compact)
  );
}

function matchesSearch(product: Product, search: string): boolean {
  const q = search.toLowerCase();
  const fitment = [
    ...(product.fitmentChassis ?? []),
    ...(product.fitmentEngines ?? []),
  ].join(" ");
  return (
    product.title.toLowerCase().includes(q) ||
    product.brand.toLowerCase().includes(q) ||
    product.model.toLowerCase().includes(q) ||
    fitment.toLowerCase().includes(q) ||
    (product.partNumber?.toLowerCase().includes(q) ?? false) ||
    sourceMatchesSearch(product.source, q) ||
    (product.url.toLowerCase().includes(q) &&
      !q.includes("http") &&
      q.length >= 4)
  );
}

export function filterProducts(
  products: Product[],
  filters: ProductFilters
): Product[] {
  let result = [...products];

  if (filters.search) {
    result = result.filter((p) => matchesSearch(p, filters.search!));
  }
  if (filters.source) {
    result = result.filter((p) => p.source === filters.source);
  }
  if (filters.model) {
    result = result.filter((p) =>
      p.model.toLowerCase().includes(filters.model!.toLowerCase())
    );
  }
  if (filters.brand) {
    result = result.filter(
      (p) => p.brand.toLowerCase() === filters.brand!.toLowerCase()
    );
  }
  if (filters.vehicle) {
    result = result.filter((p) => matchesVehiclePreset(p, filters.vehicle!));
  }
  if (filters.chassis) {
    const c = filters.chassis.toLowerCase() as ChassisTag;
    result = result.filter(
      (p) =>
        p.fitmentChassis?.includes(c) ||
        `${p.title} ${p.model}`.toLowerCase().includes(c)
    );
  }
  if (filters.engine) {
    const e = filters.engine.toLowerCase() as EngineTag;
    result = result.filter(
      (p) =>
        p.fitmentEngines?.includes(e) ||
        `${p.title} ${p.model}`.toLowerCase().includes(e)
    );
  }
  if (filters.multiModel) {
    result = result.filter((p) => p.multiModelFit === true);
  }
  if (filters.minPrice != null) {
    result = result.filter(
      (p) => p.price != null && p.price >= filters.minPrice!
    );
  }
  if (filters.maxPrice != null) {
    result = result.filter(
      (p) => p.price != null && p.price <= filters.maxPrice!
    );
  }

  switch (filters.sort) {
    case "price-asc":
      result.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
      break;
    case "price-desc":
      result.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
      break;
    case "title-asc":
      result.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case "newest":
      result.sort(
        (a, b) =>
          new Date(b.scrapedAt).getTime() - new Date(a.scrapedAt).getTime()
      );
      break;
    default:
      result.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  }

  return result;
}

export function getFilterMeta(products: Product[]) {
  const models = [...new Set(products.map((p) => p.model))].sort();
  const brands = [...new Set(products.map((p) => p.brand))].sort();
  const sources = [...new Set(products.map((p) => p.source))].sort();
  const prices = products
    .map((p) => p.price)
    .filter((p): p is number => p != null);
  return {
    models,
    brands,
    sources,
    ...getFitmentMeta(products),
    priceRange: {
      min: prices.length ? Math.min(...prices) : 0,
      max: prices.length ? Math.max(...prices) : 0,
    },
    total: products.length,
  };
}
