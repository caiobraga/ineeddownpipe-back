export type ProductSource =
  | "amazon"
  | "bimmerworld"
  | "ind"
  | "arm";

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
}

export interface ProductFilters {
  search?: string;
  source?: ProductSource;
  model?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: "price-asc" | "price-desc" | "title-asc" | "newest";
}

export interface ScrapeResult {
  source: ProductSource;
  count: number;
  error?: string;
}
