/**
 * Re-fetch Turner PDP prices for products with bad cached values.
 * Run: npm run build && npm run fix:turner-prices
 */
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { launchBrowser, newContext } from "../dist/scrapers/browser.js";
import { scrapeTurnerProductPrice } from "../dist/scrapers/turner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cachePath = join(__dirname, "../data/products.json");

function loadProducts() {
  return JSON.parse(readFileSync(cachePath, "utf-8"));
}

function saveProducts(products) {
  writeFileSync(cachePath, JSON.stringify(products, null, 2) + "\n");
}

const products = loadProducts();
const needsFix = products.filter(
  (p) => p.source === "turner" && (p.price == null || p.price < 80)
);

console.log(`Fixing ${needsFix.length} Turner price(s)…`);

let browser = await launchBrowser();
let page = await (await newContext(browser)).newPage();
let sinceRestart = 0;
let fixed = 0;

async function restartBrowser() {
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
  browser = await launchBrowser();
  page = await (await newContext(browser)).newPage();
  sinceRestart = 0;
}

for (const product of needsFix) {
  if (sinceRestart >= 3) {
    await restartBrowser();
    await new Promise((r) => setTimeout(r, 2000));
  }

  const price = await scrapeTurnerProductPrice(page, product.url);
  sinceRestart++;

  if (price != null && price >= 80) {
    product.price = price;
    fixed++;
    saveProducts(products);
    console.log(`  ${product.partNumber}: $${price}`);
  } else {
    console.warn(`  ${product.partNumber}: could not read price`);
  }

  await new Promise((r) => setTimeout(r, 1500));
}

console.log(`Done. Updated ${fixed} / ${needsFix.length} prices in products.json`);

await page.close();
await browser.close();
