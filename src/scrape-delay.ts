const DEFAULT_MS = Number(process.env.SCRAPE_DELAY_MS) || 400;

export function scrapeDelayMs(): number {
  return Number.isFinite(DEFAULT_MS) && DEFAULT_MS >= 0 ? DEFAULT_MS : 400;
}

export function delay(ms?: number): Promise<void> {
  const wait = ms ?? scrapeDelayMs();
  return new Promise((resolve) => setTimeout(resolve, wait));
}
