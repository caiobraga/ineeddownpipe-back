import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dirname, "..", "data", "refresh-state.json");

const MIN_HOURS = Number(process.env.REFRESH_MIN_HOURS) || 6;
const MIN_INTERVAL_MS = Math.max(1, MIN_HOURS) * 60 * 60 * 1000;

interface RefreshState {
  lastRefreshAt: string | null;
}

function readState(): RefreshState {
  if (!existsSync(STATE_FILE)) return { lastRefreshAt: null };
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf-8")) as RefreshState;
  } catch {
    return { lastRefreshAt: null };
  }
}

function writeState(state: RefreshState) {
  const dir = dirname(STATE_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

export function getRefreshSecret(): string | undefined {
  const s = process.env.REFRESH_SECRET?.trim();
  return s || undefined;
}

export function isRefreshAllowedBySecret(req: {
  headers: Record<string, string | string[] | undefined>;
}): boolean {
  const secret = getRefreshSecret();
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth === `Bearer ${secret}`) return true;
  const key = req.headers["x-refresh-secret"];
  if (typeof key === "string" && key === secret) return true;
  return false;
}

export function checkRefreshCooldown(): {
  allowed: boolean;
  retryAfterMs?: number;
  lastRefreshAt: string | null;
} {
  const state = readState();
  if (!state.lastRefreshAt) {
    return { allowed: true, lastRefreshAt: null };
  }
  const elapsed = Date.now() - new Date(state.lastRefreshAt).getTime();
  if (elapsed >= MIN_INTERVAL_MS) {
    return { allowed: true, lastRefreshAt: state.lastRefreshAt };
  }
  return {
    allowed: false,
    retryAfterMs: MIN_INTERVAL_MS - elapsed,
    lastRefreshAt: state.lastRefreshAt,
  };
}

export function markRefreshCompleted() {
  writeState({ lastRefreshAt: new Date().toISOString() });
}

export function getCatalogUpdatedAt(): string | null {
  return readState().lastRefreshAt;
}
