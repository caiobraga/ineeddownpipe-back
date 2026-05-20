import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { Product, ProductFilters } from "./types.js";
import { normalizeImageUrl } from "./scrapers/image-url.js";
import { isTurnerPlaceholderImage } from "./scrapers/turner-images.js";
import { getLocalTurnerImagePath } from "./turner-image-cache.js";
import { withAmazonAffiliateTag } from "./amazon-affiliate.js";

const BASE_URLS: Partial<Record<Product["source"], string>> = {
  bimmerworld: "https://www.bimmerworld.com",
  amazon: "https://www.amazon.com",
  turner: "https://www.turnermotorsport.com",
  ind: "https://ind-distribution.com",
  arm: "https://armmotorsports.com",
};

export function normalizeProduct(p: Product): Product {
  const base = BASE_URLS[p.source];
  let imageUrl = normalizeImageUrl(p.imageUrl, base) ?? null;

  if (p.source === "turner") {
    const local = getLocalTurnerImagePath(p.id);
    if (local) {
      imageUrl = local;
    } else if (
      isTurnerPlaceholderImage(imageUrl) ||
      imageUrl?.includes("assets.turnermotorsport.com")
    ) {
      imageUrl = null;
    }
  }

  const url =
    p.source === "amazon" ? withAmazonAffiliateTag(p.url) : p.url;

  return { ...p, imageUrl, url };
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

export function loadProducts(): Product[] {
  ensureDataDir();
  if (!existsSync(CACHE_FILE)) return [];
  try {
    const raw = readFileSync(CACHE_FILE, "utf-8");
    return normalizeAll(JSON.parse(raw) as Product[]);
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

function matchesSearch(product: Product, search: string): boolean {
  const q = search.toLowerCase();
  return (
    product.title.toLowerCase().includes(q) ||
    product.brand.toLowerCase().includes(q) ||
    product.model.toLowerCase().includes(q) ||
    (product.partNumber?.toLowerCase().includes(q) ?? false)
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
    priceRange: {
      min: prices.length ? Math.min(...prices) : 0,
      max: prices.length ? Math.max(...prices) : 0,
    },
    total: products.length,
  };
}
