import type { Product } from "../types.js";
import { scrapeLojaIntegrada } from "./loja-integrada.js";

export function scrapeNovaRacing(): Promise<Product[]> {
  return scrapeLojaIntegrada({
    source: "novaracing",
    baseUrl: "https://www.novaracing.com.br",
    categoryPath: "/downpipes",
    maxPages: 6,
    brand: "Nova Racing",
    bmwOnly: true,
  });
}
