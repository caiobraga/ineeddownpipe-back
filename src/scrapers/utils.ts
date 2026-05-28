/** Titles that are accessories or other exhaust parts, not downpipes. */
const HARD_EXCLUDE: RegExp[] = [
  /\bv[\s-]?band\s+clamp\b/i,
  /\bdownpipe\s+clamp\b/i,
  /\bclamp\b.*\bfor\b.*\bdownpipe\b/i,
  /\bquick\s+release\b.*\bclamp\b/i,
  /\bgasket\b/i,
  /\bconnector\s+pipe\b/i,
  /\bengine\s+block\b/i,
  /\bintake\s+hose\b/i,
  /\bair\s+intake\b/i,
  /\bcharge\s+pipe\b/i,
  /\baxle[\s-]?back\b/i,
  /\baxleback\b/i,
  /\bmid[\s-]?pipe\b/i,
  /\bmidpipe\b/i,
  /\bresonator\b/i,
  /\bmuffler\b/i,
  /\bexhaust\s+valve\s+remote\b/i,
  /\bcat[\s-]?back\b/i,
  /\bcar\s+accessories\b/i,
  /\bexhaust\s+systems?\s*$/i,
  /\bexhaust\s+manifold\b/i,
  /\bheader\s+manifold\b/i,
  /\bmanifold\s+header\b/i,
  /\bexhaust\s+pipe\s+kit\b/i,
  /\bexhaust\s+pipe\s+for\b/i,
  /\bturbo\s+inlet\s+pipe\b/i,
  /\binlet\s+pipe\s+hose\b/i,
  /\bradiator\s+hose\b/i,
  /\bheater\s+hose\b/i,
  /\boutlet\s+hose\b/i,
  /\brubber\s+downpipe\b/i,
  /\bcrossover\s+pipe\b/i,
  /\bexhaust\s+cooler\b/i,
  /\bflange\s+adapter\b/i,
  /\bflange\s+clamp\b/i,
  /\bflange\s+conversion\b/i,
  /\bflange\s+to\b/i,
  /\bdownpipe\s+flange\b/i,
  /\boutlet\s+flange\b/i,
  /\bflange\s+only\b/i,
  /\bturbocharger\s+replacement\b/i,
  /\bturbocharger\s+inlet\s+hose\b/i,
  /\bturbo\s+with\s+actuator\b/i,
  /\binstall\s+kit\b/i,
];

const DOWNPIPE_PATTERNS: RegExp[] = [
  /\bdownpipes?\b/i,
  /\bdown[\s-]pipes?\b/i,
  /\bdown\s+pipes?\b/i,
];

/** True downpipe assemblies — not clamps, flanges-only, or unrelated exhaust parts. */
export function isDownpipeProduct(title: string): boolean {
  const t = title.trim();
  if (t.length < 12) return false;
  if (!DOWNPIPE_PATTERNS.some((re) => re.test(t))) return false;
  if (HARD_EXCLUDE.some((re) => re.test(t))) return false;

  // Clamps/flanges marketed for downpipes (title leads with size + v-band)
  if (/^\d+(\.\d+)?\s*(inch|in)\b/i.test(t) && /\bv[\s-]?band\b/i.test(t))
    return false;

  return true;
}

const AMAZON_HARD_EXCLUDE: RegExp[] = [
  /\bv[\s-]?band\s+clamp\b/i,
  /\bclamp\b.*\bfor\b.*\bdownpipe\b/i,
  /\bgasket\b/i,
  /\bcharge\s+pipe\b/i,
  /\bcharge\s+pipe\s+kit\b/i,
  /\bthrottle\s+body\s+piping\b/i,
  /\bair\s+intake\b/i,
  /\bintake\s+hose\b/i,
  /\baxle[\s-]?back\b/i,
  /\bcat[\s-]?back\b/i,
  /\bmid[\s-]?pipe\b/i,
  /\bmuffler\b/i,
  /\btailpipe\b/i,
  /\btail\s+pipe\b/i,
  /\bflange\s+only\b/i,
  /\bflange\s+gasket\b/i,
  /\bmanifold\s+to\s+down\s+pipe\s+gasket\b/i,
  /\binstall\s+kit\b/i,
  /\bcarbon\s+fiber\s+exhaust\s+dual\s+end\b/i,
];

/** Amazon titles often say "Exhaust Pipe" instead of "downpipe" — still BMW turbo exhaust. */
export function isAmazonDownpipeProduct(title: string): boolean {
  if (isDownpipeProduct(title)) return true;

  const t = title.trim();
  if (t.length < 15) return false;
  if (AMAZON_HARD_EXCLUDE.some((re) => re.test(t))) return false;

  const bmwRelated =
    /\bbmw\b/i.test(t) ||
    /\b(f20|f22|f30|f32|f34|f36|f80|f87|g20|g22|g29|g80|g82|e9[0-9])\b/i.test(t);
  if (!bmwRelated) return false;

  if (/\bdownpipes?\b/i.test(t) || /\bdown[\s-]pipes?\b/i.test(t)) return true;

  if (
    /\bexhaust\s+pipe\b/i.test(t) &&
    /\b(n55|b58|n20|n26|s55|s58|turbo|335i|340i|328i|428i|230i|m3|m4|540i|740i|228i|320i|330i)\b/i.test(
      t
    )
  ) {
    return true;
  }

  if (/\bturbo\b/i.test(t) && /\b(exhaust\s+pipe|downpipe|front\s+pipe)\b/i.test(t)) {
    return true;
  }

  return false;
}

export function passesDownpipeFilter(
  title: string,
  source?: string
): boolean {
  if (source === "amazon") return isAmazonDownpipeProduct(title);
  return isDownpipeProduct(title);
}

export function parsePrice(text: string): number | null {
  const match = text.replace(/,/g, "").match(/[\d]+(?:\.\d{2})?/);
  return match ? parseFloat(match[0]) : null;
}

export function slugId(source: string, externalId: string): string {
  return `${source}-${externalId}`;
}
