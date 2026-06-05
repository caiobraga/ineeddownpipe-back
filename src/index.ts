import "dotenv/config";
import express from "express";
import cors from "cors";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { Request } from "express";
import {
  filterProducts,
  getFilterMeta,
  loadProducts,
  saveProducts,
} from "./store.js";
import type { ProductFilters, ProductSource } from "./types.js";
import { runAllScrapers, SCRAPER_SOURCES } from "./scrapers/index.js";
import { passesDownpipeFilter } from "./scrapers/utils.js";
import {
  checkRefreshCooldown,
  getCatalogUpdatedAt,
  isRefreshAllowedBySecret,
  markRefreshCompleted,
} from "./refresh-policy.js";
import seedProducts from "./data/seed.json" with { type: "json" };
import { requireSupabaseUser } from "./supabase.js";
import { stripe, stripeWebhookSecret, usedListingFeeCents, siteUrl } from "./stripe.js";
import {
  CreateUsedListingSchema,
  createDraftUsedListing,
  ensurePaymentRow,
  getUsedListingById,
  listPublishedUsedListings,
  markListingPaidAndPublish,
} from "./used-listings.js";

function onlyDownpipes<T extends { title: string; source?: string }>(
  items: T[]
): T[] {
  return items.filter((p) => passesDownpipeFilter(p.title, p.source));
}

const app = express();
const PORT = Number(process.env.PORT || 3001);
const AUTO_REFRESH_ON_STARTUP = (
  process.env.AUTO_REFRESH_ON_STARTUP ??
  (process.env.NODE_ENV === "production" ? "if-empty" : "false")
).toLowerCase();
const AUTO_REFRESH_STARTUP_DELAY_MS = Number(
  process.env.AUTO_REFRESH_STARTUP_DELAY_MS || 1500
);
const AUTO_REFRESH_INTERVAL_HOURS = Number(
  process.env.AUTO_REFRESH_INTERVAL_HOURS || 0
);

const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : true;

app.use(cors({ origin: corsOrigins }));

// Stripe webhook needs the raw body. Keep this route BEFORE express.json().
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    if (typeof sig !== "string") {
      return res.status(400).send("Missing Stripe-Signature");
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        stripeWebhookSecret()
      );
    } catch (err) {
      return res.status(400).send(
        err instanceof Error ? err.message : "Invalid signature"
      );
    }

    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object as {
          id: string;
          payment_intent?: string | null;
          payment_intent_id?: string | null;
        };
        await markListingPaidAndPublish({
          sessionId: session.id,
          paymentIntentId:
            (session.payment_intent as string | null | undefined) ??
            (session.payment_intent_id as string | null | undefined) ??
            null,
        });
      }
    } catch (err) {
      console.error(
        "[stripe webhook] error:",
        err instanceof Error ? err.message : err
      );
      return res.status(500).send("Webhook handler failed");
    }

    return res.json({ received: true });
  }
);

app.use(express.json());

async function requireAuth(req: Request) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) throw new Error("Unauthorized");
  const token = auth.slice("Bearer ".length).trim();
  return await requireSupabaseUser(token);
}

function getProductsList() {
  const cached = onlyDownpipes(loadProducts());
  if (cached.length > 0) return cached;
  return onlyDownpipes(seedProducts as ReturnType<typeof loadProducts>);
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/products", (req, res) => {
  const products = getProductsList();
  const filters: ProductFilters = {
    search: req.query.search as string | undefined,
    source: req.query.source as ProductSource | undefined,
    model: req.query.model as string | undefined,
    brand: req.query.brand as string | undefined,
    chassis: req.query.chassis as string | undefined,
    engine: req.query.engine as string | undefined,
    vehicle: req.query.vehicle as string | undefined,
    multiModel:
      req.query.multiModel === "true" || req.query.multiModel === "1",
    minPrice: req.query.minPrice
      ? Number(req.query.minPrice)
      : undefined,
    maxPrice: req.query.maxPrice
      ? Number(req.query.maxPrice)
      : undefined,
    sort: (req.query.sort as ProductFilters["sort"]) || "price-asc",
  };

  // Used listings live in Supabase; fetch and merge (best effort).
  void (async () => {
    let used: any[] = [];
    try {
      used = await listPublishedUsedListings(200);
    } catch {
      used = [];
    }

    const usedAsProducts = used.map((u) => ({
      id: `used-${u.id}`,
      title: u.title,
      brand: "Private seller",
      price: u.price_cents != null ? Number(u.price_cents) / 100 : null,
      currency: u.currency || "USD",
      imageUrl: (u.images?.[0] as string | undefined) ?? null,
      url: `${siteUrl()}/sell?listing=${u.id}`,
      source: "used",
      model:
        (u.engine?.length ? `${u.engine.join("/")}` : "BMW") +
        " (used listing)",
      partNumber: null,
      inStock: true,
      scrapedAt: u.published_at || u.created_at || new Date().toISOString(),
      fitmentChassis: (u.chassis ?? []).map((c: string) => c.toLowerCase()),
      fitmentEngines: (u.engine ?? []).map((e: string) => e.toLowerCase()),
      multiModelFit: (u.chassis?.length ?? 0) > 1,
      usedListing: {
        id: u.id,
        status: u.status,
        condition: u.condition,
        location: u.location,
        contactEmail: u.contact_email,
        notes: u.notes,
        images: u.images ?? [],
      },
    }));

    const allProducts = [...products, ...usedAsProducts];
    const filtered = filterProducts(allProducts as any, filters);
    const meta = {
      ...getFilterMeta(allProducts as any),
      catalogUpdatedAt: getCatalogUpdatedAt(),
    };

    res.json({ products: filtered, meta, count: filtered.length });
  })();
});

app.get("/api/meta", (_req, res) => {
  const products = getProductsList();
  const meta = getFilterMeta(products);
  res.json({
    ...meta,
    catalogUpdatedAt: getCatalogUpdatedAt(),
  });
});

// Used listings API
app.post("/api/used-listings", async (req, res) => {
  try {
    const user = await requireAuth(req);
    const input = CreateUsedListingSchema.parse(req.body);
    const listing = await createDraftUsedListing({
      ownerId: user.id,
      input,
    });
    res.json({ listing });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed";
    res.status(msg === "Unauthorized" ? 401 : 400).json({ error: msg });
  }
});

app.get("/api/used-listings/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const listing = await getUsedListingById(id);
    if (!listing) return res.status(404).json({ error: "Not found" });
    // Public only if published; owner can view drafts
    if (listing.status !== "published") {
      const user = await requireAuth(req).catch(() => null);
      if (!user || user.id !== listing.owner_id) {
        return res.status(404).json({ error: "Not found" });
      }
    }
    res.json({ listing });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

app.post("/api/used-listings/:id/checkout", async (req, res) => {
  try {
    const user = await requireAuth(req);
    const id = String(req.params.id || "");
    const listing = await getUsedListingById(id);
    if (!listing || listing.owner_id !== user.id) {
      return res.status(404).json({ error: "Not found" });
    }
    if (listing.status !== "draft") {
      return res.status(409).json({ error: "Listing is not in draft status" });
    }

    const fee = usedListingFeeCents();
    const currency = String(listing.currency || "USD").toLowerCase();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: fee,
            product_data: {
              name: "Used downpipe listing fee",
            },
          },
        },
      ],
      metadata: {
        listing_id: id,
        owner_id: user.id,
      },
      success_url: `${siteUrl()}/sell?success=1&listing=${id}`,
      cancel_url: `${siteUrl()}/sell?canceled=1&listing=${id}`,
    });

    await ensurePaymentRow({
      listingId: id,
      ownerId: user.id,
      sessionId: session.id,
      amountCents: fee,
      currency: currency.toUpperCase(),
    });

    return res.json({ checkoutUrl: session.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed";
    res.status(msg === "Unauthorized" ? 401 : 400).json({ error: msg });
  }
});

let refreshInProgress = false;

async function refreshCatalog(reason: string) {
  if (refreshInProgress) return null;

  refreshInProgress = true;
  const startedAt = Date.now();
  console.log(`[refresh] ${reason} started`);

  try {
    const { products, results } = await runAllScrapers();
    const cleaned = onlyDownpipes(products);
    if (cleaned.length > 0) {
      saveProducts(cleaned);
      markRefreshCompleted();
    }

    console.log(`[refresh] ${reason} scrape results:`);
    for (const r of results) {
      if (r.error) {
        console.log(`  - ${r.source}: ${r.count} items (error: ${r.error})`);
      } else {
        console.log(`  - ${r.source}: ${r.count} items`);
      }
    }

    console.log(
      `[refresh] ${reason} completed with ${cleaned.length} products in ${
        Date.now() - startedAt
      }ms`,
    );

    return { products: cleaned, results };
  } finally {
    refreshInProgress = false;
  }
}

function runBackgroundRefresh(reason: string, force = false) {
  if (refreshInProgress) return;

  if (!force) {
    const cooldown = checkRefreshCooldown();
    if (!cooldown.allowed) {
      console.log(
        `[refresh] ${reason} skipped; cooldown active until ${new Date(
          Date.now() + (cooldown.retryAfterMs ?? 0),
        ).toISOString()}`,
      );
      return;
    }
  }

  void refreshCatalog(reason).catch((err) => {
    console.error(
      `[refresh] ${reason} failed:`,
      err instanceof Error ? err.message : err,
    );
  });
}

function catalogMissingSources(products: ReturnType<typeof loadProducts>): boolean {
  const present = new Set(products.map((p) => p.source));
  return SCRAPER_SOURCES.some((source) => !present.has(source));
}

function scheduleAutomaticRefreshes() {
  const cached = onlyDownpipes(loadProducts());
  const cachedCount = cached.length;
  const missingSources = catalogMissingSources(cached);
  const shouldRefreshOnStartup =
    AUTO_REFRESH_ON_STARTUP === "always" ||
    AUTO_REFRESH_ON_STARTUP === "true" ||
    (AUTO_REFRESH_ON_STARTUP === "if-empty" && cachedCount === 0) ||
    missingSources;

  if (shouldRefreshOnStartup) {
    setTimeout(
      () =>
        runBackgroundRefresh(
          missingSources ? "startup-missing-sources" : "startup",
          cachedCount === 0 || missingSources,
        ),
      AUTO_REFRESH_STARTUP_DELAY_MS,
    );
  }

  if (AUTO_REFRESH_INTERVAL_HOURS > 0) {
    setInterval(
      () => runBackgroundRefresh("scheduled"),
      AUTO_REFRESH_INTERVAL_HOURS * 60 * 60 * 1000,
    );
  }
}

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

  try {
    const refresh = await refreshCatalog("manual");
    if (!refresh) {
      return res.status(409).json({ error: "Refresh already in progress" });
    }

    res.json({
      ok: true,
      count: refresh.products.length,
      results: refresh.results,
      catalogUpdatedAt: getCatalogUpdatedAt(),
      message: "Catalog updated",
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Failed to refresh",
    });
  }
});

const server = app.listen(PORT, () => {
  console.log(`API running at http://localhost:${PORT}`);
  scheduleAutomaticRefreshes();
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} is already in use. Set another port with PORT=${PORT + 1} npm run dev or update ineeddownpipe-back/.env.`,
    );
    process.exit(1);
  }
  throw error;
});
