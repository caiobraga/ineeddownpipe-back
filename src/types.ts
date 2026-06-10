export type ProductSource =
  | "amazon"
  | "bimmerworld"
  | "ind"
  | "arm"
  | "novaracing"
  | "turbobrothers"
  | "eurosport"
  | "vrsf"
  | "trucrane"
  | "used";

export interface Product {
  id: string;
  title: string;
  brand: string;
  price: number | null;
  currency: string;
  imageUrl: string | null;
  url: string;
  source: ProductSource;
  model: string;
  partNumber?: string;
  inStock?: boolean;
  scrapedAt: string;
  /** Parsed from title — chassis codes (g20, f30, f3x, …). */
  fitmentChassis?: string[];
  /** Parsed from title — engine families (b58, n55, …). */
  fitmentEngines?: string[];
  /** Lists several models/platforms in the title. */
  multiModelFit?: boolean;
}

export interface ProductFilters {
  search?: string;
  source?: ProductSource;
  model?: string;
  brand?: string;
  chassis?: string;
  engine?: string;
  vehicle?: string;
  multiModel?: boolean;
  minPrice?: number;
  maxPrice?: number;
  sort?: "price-asc" | "price-desc" | "title-asc" | "newest";
}

export interface ScrapeResult {
  source: ProductSource;
  count: number;
  error?: string;
}
