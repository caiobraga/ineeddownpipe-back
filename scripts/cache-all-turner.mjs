/**
 * Download Turner product images into data/images/ and update products.json.
 * Run: npm run cache:turner
 */
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { launchBrowser, newContext } from "../dist/scrapers/browser.js";
import { waitPastChallenge } from "../dist/scrapers/browser.js";
import {
  cacheTurnerImage,
  cacheTurnerImageFromPage,
  getLocalTurnerImagePath,
} from "../dist/turner-image-cache.js";
import { normalizeImageUrl } from "../dist/scrapers/image-url.js";
import { isTurnerProductImage } from "../dist/scrapers/turner-images.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cache = join(__dirname, "../data/products.json");
const products = JSON.parse(readFileSync(cache, "utf-8"));
const turner = products.filter((p) => p.source === "turner");

console.log(`Caching images for ${turner.length} Turner products…`);

let browser = await launchBrowser();
let page = await (await newContext(browser)).newPage();
let sinceRestart = 0;
let ok = 0;
let skip = 0;

async function restart() {
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
  browser = await launchBrowser();
  page = await (await newContext(browser)).newPage();
  sinceRestart = 0;
}

for (const product of turner) {
  const existing = getLocalTurnerImagePath(product.id);
  if (existing) {
    product.imageUrl = existing;
    ok++;
    continue;
  }

  if (sinceRestart >= 3) await restart();

  async function tryCache() {
    await page.goto(product.url, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });

    const blocked = await page.evaluate(() =>
      document.body.innerText.toLowerCase().includes("robot check")
    );
    if (blocked) return null;

    await waitPastChallenge(page, 10000);

    const raw = await page.evaluate(() => {
      const og = document
        .querySelector('meta[property="og:image"]')
        ?.getAttribute("content");
      if (og && og.includes("product_library")) return og;
      for (const img of document.querySelectorAll("img")) {
        const src = img.currentSrc || img.src || "";
        if (src.includes("product_library_tms") && !src.includes("no_image")) {
          return src;
        }
      }
      return null;
    });

    const normalized = normalizeImageUrl(
      raw,
      "https://www.turnermotorsport.com"
    );

    if (normalized && isTurnerProductImage(normalized)) {
      const cached = await cacheTurnerImage(page, normalized, product.id);
      if (cached) return cached;
    }
    return cacheTurnerImageFromPage(page, product.id);
  }

  try {
    let local = await tryCache();
    if (!local) {
      await restart();
      local = await tryCache();
    }

    if (local) {
      product.imageUrl = local;
      ok++;
      console.log("OK", product.partNumber);
    } else {
      product.imageUrl = null;
      skip++;
      console.log("skip", product.partNumber);
    }
  } catch (e) {
    skip++;
    console.log("err", product.partNumber, e.message);
  }

  sinceRestart++;
  await new Promise((r) => setTimeout(r, 500));
}

writeFileSync(cache, JSON.stringify(products, null, 2));
await browser.close();
console.log(`Done. cached=${ok} skipped=${skip}`);
