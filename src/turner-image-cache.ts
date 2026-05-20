import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { Page } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const TURNER_IMAGES_DIR = join(__dirname, "..", "data", "images");

export function ensureImagesDir() {
  if (!existsSync(TURNER_IMAGES_DIR)) {
    mkdirSync(TURNER_IMAGES_DIR, { recursive: true });
  }
}

function isImageBuffer(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8) return true;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return true;
  const head = buf.subarray(0, 12).toString("ascii");
  return head.includes("WEBP") || head.startsWith("RIFF");
}

export function getLocalTurnerImagePath(productId: string): string | null {
  for (const ext of ["jpg", "webp", "jpeg"]) {
    const file = join(TURNER_IMAGES_DIR, `${productId}.${ext}`);
    if (existsSync(file) && isImageBuffer(readFileSync(file))) {
      return `/api/product-images/${productId}.${ext}`;
    }
  }
  return null;
}

export function saveTurnerImageBuffer(
  productId: string,
  buf: Buffer,
  preferExt = "jpg"
): string | null {
  if (!isImageBuffer(buf)) return null;
  const ext =
    preferExt === "webp" && buf.subarray(0, 12).toString("ascii").includes("WEBP")
      ? "webp"
      : "jpg";
  ensureImagesDir();
  const filename = `${productId}.${ext}`;
  writeFileSync(join(TURNER_IMAGES_DIR, filename), buf);
  return `/api/product-images/${filename}`;
}

/** Download Turner CDN image using the browser session (avoids CDN 403). */
export async function cacheTurnerImage(
  page: Page,
  remoteUrl: string,
  productId: string
): Promise<string | null> {
  const existing = getLocalTurnerImagePath(productId);
  if (existing) return existing;

  try {
    const bytes = await page.evaluate(async (url) => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      return Array.from(new Uint8Array(buf));
    }, remoteUrl);

    if (!bytes?.length) return null;
    return saveTurnerImageBuffer(productId, Buffer.from(bytes));
  } catch {
    return null;
  }
}

/** Fallback: screenshot the main product image on the PDP. */
export async function cacheTurnerImageFromPage(
  page: Page,
  productId: string
): Promise<string | null> {
  const existing = getLocalTurnerImagePath(productId);
  if (existing) return existing;

  const selectors = [
    "#main-image img",
    ".product-image img",
    ".product-primary-image img",
    "img[src*='product_library_tms']",
    "[class*='product'] img[src*='product_library']",
  ];

  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if ((await loc.count()) === 0) continue;
    try {
      await loc.scrollIntoViewIfNeeded().catch(() => {});
      const buf = await loc.screenshot({ type: "jpeg", quality: 88 });
      const saved = saveTurnerImageBuffer(productId, buf, "jpg");
      if (saved) return saved;
    } catch {
      /* try next */
    }
  }
  return null;
}
