import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { launchBrowser, newContext } from "../dist/scrapers/browser.js";
import { waitPastChallenge } from "../dist/scrapers/browser.js";
import {
  isTurnerPlaceholderImage,
  isTurnerProductImage,
} from "../dist/scrapers/turner-images.js";
import { normalizeImageUrl } from "../dist/scrapers/image-url.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cache = join(__dirname, "../data/products.json");
const products = JSON.parse(readFileSync(cache, "utf-8"));
const needs = products.filter(
  (p) => p.source === "turner" && !isTurnerProductImage(p.imageUrl)
);

console.log(`Fixing ${needs.length} Turner products…`);

let browser = await launchBrowser();
let page = await (await newContext(browser)).newPage();
let sinceRestart = 0;

async function restartBrowser() {
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
  browser = await launchBrowser();
  page = await (await newContext(browser)).newPage();
  sinceRestart = 0;
}

function extractOgFromHtml(html) {
  const m =
    html.match(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
    ) ||
    html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i
    );
  return m?.[1] || null;
}

for (const product of needs) {
  if (sinceRestart >= 8) await restartBrowser();

  try {
    await page.goto(product.url, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });

    const blocked = await page.evaluate(() =>
      document.body.innerText.toLowerCase().includes("robot check")
    );
    if (blocked) {
      console.log("blocked, restart", product.partNumber);
      await restartBrowser();
      sinceRestart = 8;
      continue;
    }

    if (!blocked) await waitPastChallenge(page, 8000);

    const html = await page.content();
    const raw = extractOgFromHtml(html);
    const imageUrl = normalizeImageUrl(
      raw,
      "https://www.turnermotorsport.com"
    );

    if (imageUrl && isTurnerProductImage(imageUrl)) {
      product.imageUrl = imageUrl;
      console.log("OK", product.partNumber);
    } else {
      product.imageUrl = null;
      console.log("skip", product.partNumber);
    }
  } catch (e) {
    console.log("err", product.partNumber, e.message);
  }

  sinceRestart++;
  await new Promise((r) => setTimeout(r, 400));
}

writeFileSync(cache, JSON.stringify(products, null, 2));
await browser.close();
console.log("Done.");
