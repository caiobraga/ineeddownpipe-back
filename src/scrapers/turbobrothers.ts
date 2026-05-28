import type { Product } from "../types.js";
import { scrapeLojaIntegrada } from "./loja-integrada.js";

export function scrapeTurboBrothers(): Promise<Product[]> {
  return scrapeLojaIntegrada({
    source: "turbobrothers",
    baseUrl: "https://www.turbobrothers.com.br",
    categoryPath: "/downpipe",
    maxPages: 1,
    brand: "Turbo Brothers",
    bmwOnly: true,
  });
}
