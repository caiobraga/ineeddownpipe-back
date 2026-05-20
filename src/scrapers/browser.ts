import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });
}

export async function newContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    userAgent: USER_AGENT,
    locale: "en-US",
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
}

/** Wait out Cloudflare interstitial when possible */
export async function waitPastChallenge(page: Page, timeoutMs = 45000) {
  try {
    await page.waitForFunction(
      () => {
        const t = document.title.toLowerCase();
        const body = document.body?.innerText?.toLowerCase() || "";
        if (t.includes("moment") || t.includes("just a moment")) return false;
        if (body.includes("checking your browser")) return false;
        if (body.includes("sorry, you have been blocked")) return false;
        return true;
      },
      { timeout: timeoutMs }
    );
  } catch {
    /* still blocked */
  }
}
