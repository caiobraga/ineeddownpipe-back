/** Normalize retailer image URLs (Shopify //cdn, relative paths, double host). */
export function normalizeImageUrl(
  url: string | null | undefined,
  baseUrl?: string
): string | null {
  if (!url?.trim()) return null;

  let u = url.trim();

  if (u.startsWith("//")) return `https:${u}`;

  if (/^https?:\/\/[^/]+\/\/cdn\./i.test(u)) {
    u = u.replace(/^https?:\/\/[^/]+\/\//i, "https://");
  }

  if (/^https?:\/\//i.test(u)) return u;

  if (baseUrl) {
    try {
      return new URL(u.startsWith("/") ? u : `/${u}`, baseUrl).href;
    } catch {
      return null;
    }
  }

  return null;
}
