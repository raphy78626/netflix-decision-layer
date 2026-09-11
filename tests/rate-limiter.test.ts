import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory storage.local stub
const localStore = new Map<string, unknown>();

vi.mock('@/storage/settings', () => ({
  getSettings: vi.fn(),
}));

// Stub chrome.storage.local for the rate limiter
const chromeStub = {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: localStore.get(key) })),
      set: vi.fn(async (obj: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(obj)) localStore.set(k, v);
      }),
    },
    onChanged: { addListener: vi.fn() },
  },
  runtime: {
    onMessage: { addListener: vi.fn() },
    onInstalled: { addListener: vi.fn() },
  },
};
(globalThis as unknown as { chrome: typeof chromeStub }).chrome = chromeStub;

import { tryAcquire, getStatus } from '@/background/rate-limiter';

describe('rate-limiter', () => {
  beforeEach(() => {
    localStore.clear();
  });

  it('allows first 10 requests in a minute', async () => {
    for (let i = 0; i < 10; i++) {
      const r = await tryAcquire();
      expect(r.allowed).toBe(true);
    }
    const r = await tryAcquire();
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('burst');
  });

  it('reports daily count via getStatus', async () => {
    for (let i = 0; i < 5; i++) await tryAcquire();
    const s = await getStatus();
    expect(s.dayCount).toBe(5);
    expect(s.dayLimit).toBe(1000);
    expect(s.burstLimit).toBe(10);
  });

  it('retryAfterMs is positive when limited', async () => {
    for (let i = 0; i < 10; i++) await tryAcquire();
    const r = await tryAcquire();
    expect(r.allowed).toBe(false);
    expect(r.retryAfterMs).toBeGreaterThan(0);
  });
});
