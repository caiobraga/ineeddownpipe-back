import "dotenv/config";
import { runAllScrapers } from "./scrapers/index.js";
import { saveProducts } from "./store.js";
import { markRefreshCompleted } from "./refresh-policy.js";

console.log("Starting product scrape...");
const { products, results } = await runAllScrapers();

if (products.length > 0) {
  saveProducts(products);
  markRefreshCompleted();
  console.log(`Saved ${products.length} products.`);
} else {
  console.log("No products scraped.");
}

for (const r of results) {
  console.log(
    `  ${r.source}: ${r.count} items${r.error ? ` (${r.error})` : ""}`
  );
}

process.exit(0);
