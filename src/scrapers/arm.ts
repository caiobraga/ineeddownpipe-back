import type { Product } from "../types.js";
import { scrapeShopifyStore } from "./shopify.js";

const BASE = "https://armmotorsports.com";

export async function scrapeArm(): Promise<Product[]> {
  return scrapeShopifyStore(BASE, "arm", ["bmw downpipe", "bmw turbo downpipe"], 25);
}
