import type { Product } from "../types.js";
import { scrapeShopifyStore } from "./shopify.js";

const BASE = "https://ind-distribution.com";

export async function scrapeInd(): Promise<Product[]> {
  return scrapeShopifyStore(BASE, "ind", ["bmw downpipe", "bmw turbo downpipe"], 30);
}
