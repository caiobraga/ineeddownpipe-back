import "dotenv/config";
import express from "express";
import cors from "cors";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  filterProducts,
  getFilterMeta,
  loadProducts,
  saveProducts,
} from "./store.js";
import type { ProductFilters, ProductSource } from "./types.js";
import { runAllScrapers } from "./scrapers/index.js";
import { passesDownpipeFilter } from "./scrapers/utils.js";
import {
  checkRefreshCooldown,
  getCatalogUpdatedAt,
  isRefreshAllowedBySecret,
  markRefreshCompleted,
} from "./refresh-policy.js";
import { handleImageProxy } from "./image-proxy.js";
import { TURNER_IMAGES_DIR } from "./turner-image-cache.js";
import seedProducts from "./data/seed.json" with { type: "json" };

function onlyDownpipes<T extends { title: string; source?: string }>(
  items: T[]
): T[] {
  return items.filter((p) => passesDownpipeFilter(p.title, p.source));
}

const app = express();
const PORT = process.env.PORT || 3001;

const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : true;

app.use(cors({ origin: corsOrigins }));
app.use(express.json());
app.use("/api/product-images", express.static(TURNER_IMAGES_DIR));

function getProductsList() {
  const cached = onlyDownpipes(loadProducts());
  if (cached.length > 0) return cached;
  return onlyDownpipes(seedProducts as ReturnType<typeof loadProducts>);
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/image-proxy", (req, res) => {
  void handleImageProxy(req, res);
});

app.get("/api/products", (req, res) => {
  const products = getProductsList();
  const filters: ProductFilters = {
    search: req.query.search as string | undefined,
    source: req.query.source as ProductSource | undefined,
    model: req.query.model as string | undefined,
    brand: req.query.brand as string | undefined,
    minPrice: req.query.minPrice
      ? Number(req.query.minPrice)
      : undefined,
    maxPrice: req.query.maxPrice
      ? Number(req.query.maxPrice)
      : undefined,
    sort: (req.query.sort as ProductFilters["sort"]) || "price-asc",
  };

  const filtered = filterProducts(products, filters);
  const meta = {
    ...getFilterMeta(products),
    catalogUpdatedAt: getCatalogUpdatedAt(),
  };

  res.json({ products: filtered, meta, count: filtered.length });
});

app.get("/api/meta", (_req, res) => {
  const products = getProductsList();
  const meta = getFilterMeta(products);
  res.json({
    ...meta,
    catalogUpdatedAt: getCatalogUpdatedAt(),
  });
});

let refreshInProgress = false;

app.post("/api/refresh", async (req, res) => {
  if (!isRefreshAllowedBySecret(req)) {
    return res.status(403).json({
      error:
        "Refresh is disabled for public use. Set REFRESH_SECRET and send Authorization: Bearer <secret>, or run npm run refresh on the server.",
    });
  }

  const cooldown = checkRefreshCooldown();
  if (!cooldown.allowed) {
    const hours = Math.ceil((cooldown.retryAfterMs ?? 0) / 3600000);
    return res.status(429).json({
      error: `Catalog was refreshed recently. Try again in about ${hours} hour(s).`,
      retryAfterMs: cooldown.retryAfterMs,
      lastRefreshAt: cooldown.lastRefreshAt,
    });
  }

  if (refreshInProgress) {
    return res.status(409).json({ error: "Refresh already in progress" });
  }
  refreshInProgress = true;
  try {
    const { products, results } = await runAllScrapers();
    if (products.length > 0) {
      const cleaned = onlyDownpipes(products);
      saveProducts(cleaned);
      markRefreshCompleted();
    }
    res.json({
      ok: true,
      count: products.length,
      results,
      catalogUpdatedAt: getCatalogUpdatedAt(),
      message: "Catalog updated",
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Failed to refresh",
    });
  } finally {
    refreshInProgress = false;
  }
});

app.listen(PORT, () => {
  console.log(`API running at http://localhost:${PORT}`);
});
