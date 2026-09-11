// Token bucket rate limiter for OMDb free tier (1000/day, 10/min burst).
// State persisted in chrome.storage.local so it survives service worker restarts.

const DAILY_LIMIT = 1000;
const BURST_PER_MIN = 10;
const MIN_WINDOW_MS = 60 * 1000;
const DAY_WINDOW_MS = 24 * 60 * 60 * 1000;

interface LimiterState {
  dayStart: number; // epoch ms start of current day window
  dayCount: number;
  minStart: number;
  minCount: number;
}

const KEY = 'ndl_rate_limiter';

async function load(): Promise<LimiterState> {
  const stored = await chrome.storage.local.get(KEY);
  const now = Date.now();
  const s = (stored[KEY] as LimiterState | undefined) ?? {
    dayStart: now,
    dayCount: 0,
    minStart: now,
    minCount: 0,
  };
  // Reset windows if expired
  if (now - s.dayStart > DAY_WINDOW_MS) {
    s.dayStart = now;
    s.dayCount = 0;
  }
  if (now - s.minStart > MIN_WINDOW_MS) {
    s.minStart = now;
    s.minCount = 0;
  }
  return s;
}

async function save(s: LimiterState): Promise<void> {
  await chrome.storage.local.set({ [KEY]: s });
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
  reason?: 'daily' | 'burst';
}

export async function tryAcquire(): Promise<RateLimitResult> {
  const s = await load();
  const now = Date.now();
  if (now - s.dayStart > DAY_WINDOW_MS) {
    s.dayStart = now;
    s.dayCount = 0;
  }
  if (now - s.minStart > MIN_WINDOW_MS) {
    s.minStart = now;
    s.minCount = 0;
  }
  if (s.dayCount >= DAILY_LIMIT) {
    return { allowed: false, reason: 'daily', retryAfterMs: DAY_WINDOW_MS - (now - s.dayStart) };
  }
  if (s.minCount >= BURST_PER_MIN) {
    return { allowed: false, reason: 'burst', retryAfterMs: MIN_WINDOW_MS - (now - s.minStart) };
  }
  s.dayCount += 1;
  s.minCount += 1;
  await save(s);
  return { allowed: true };
}

export async function getStatus(): Promise<{
  dayCount: number;
  minCount: number;
  dayLimit: number;
  burstLimit: number;
}> {
  const s = await load();
  return {
    dayCount: s.dayCount,
    minCount: s.minCount,
    dayLimit: DAILY_LIMIT,
    burstLimit: BURST_PER_MIN,
  };
}

// Test helpers
export function _resetForTest(): void {
  // no-op in production; tests stub chrome.storage.local
}
