import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { launchBrowser, newContext } from "../dist/scrapers/browser.js";
import { waitPastChallenge } from "../dist/scrapers/browser.js";

const part = process.argv[2] || "214370";
const __dirname = dirname(fileURLToPath(import.meta.url));
const cache = join(__dirname, "../data/products.json");
const products = JSON.parse(readFileSync(cache, "utf-8"));
const product = products.find(
  (p) => p.source === "turner" && p.partNumber === part
);
if (!product) {
  console.error("Not found", part);
  process.exit(1);
}

const browser = await launchBrowser();
const page = await (await newContext(browser)).newPage();
await page.goto(product.url, { waitUntil: "domcontentloaded", timeout: 90000 });
await waitPastChallenge(page, 15000);
const og = await page
  .locator('meta[property="og:image"]')
  .getAttribute("content");
product.imageUrl = og;
writeFileSync(cache, JSON.stringify(products, null, 2));
console.log(part, "->", og);
await browser.close();
