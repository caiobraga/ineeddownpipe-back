import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });
}

export async function newContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    locale: "en-US",
    timezoneId: "America/New_York",
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  await context.addInitScript(() => {
    Object.defineProperty(globalThis, "__name", {
      value: (fn: unknown) => fn,
      configurable: true,
    });
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });
  });

  return context;
}

export async function evaluateBrowserFunction<Arg, Result>(
  page: Page,
  fn: (arg: Arg) => Result,
  arg: Arg
): Promise<Result> {
  const argExpression = JSON.stringify(arg) ?? "undefined";
  const expression = `(() => {
    Object.defineProperty(globalThis, "__name", {
      value: (fn) => fn,
      configurable: true
    });
    const browserFn = (0, eval)(${JSON.stringify(`(${fn.toString()})`)});
    return browserFn(${argExpression});
  })()`;

  return page.evaluate(expression) as Promise<Result>;
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
