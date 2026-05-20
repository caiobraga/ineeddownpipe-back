/** Amazon Associates store ID (e.g. inbmw-20). */
const DEFAULT_TAG = "inbmw-20";

export function getAmazonAssociateTag(): string {
  return process.env.AMAZON_ASSOCIATE_TAG?.trim() || DEFAULT_TAG;
}

export function extractAmazonAsin(url: string): string | null {
  const m =
    url.match(/\/dp\/([A-Z0-9]{10})(?:[/?]|$)/i) ||
    url.match(/\/gp\/product\/([A-Z0-9]{10})(?:[/?]|$)/i);
  return m?.[1]?.toUpperCase() ?? null;
}

/** Product or search URL with associate tag applied. */
export function withAmazonAffiliateTag(url: string): string {
  const tag = getAmazonAssociateTag();
  if (!tag) return url;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  if (!/amazon\./i.test(parsed.hostname)) return url;

  const asin = extractAmazonAsin(url);
  if (asin) {
    const out = new URL(`https://www.amazon.com/dp/${asin}`);
    out.searchParams.set("tag", tag);
    return out.toString();
  }

  parsed.searchParams.delete("tag");
  parsed.searchParams.delete("linkCode");
  parsed.searchParams.set("tag", tag);
  return parsed.toString();
}

export function amazonProductUrl(asin: string): string {
  const url = new URL(`https://www.amazon.com/dp/${asin}`);
  url.searchParams.set("tag", getAmazonAssociateTag());
  return url.toString();
}
