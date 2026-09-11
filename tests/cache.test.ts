import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory idb stub
const stores: Record<string, Map<string, unknown>> = { resolved: new Map(), ratings: new Map() };

vi.mock('idb', () => ({
  openDB: vi.fn(async () => ({
    get: async (store: string, key: string) => stores[store]?.get(key),
    put: async (store: string, value: { fingerprint?: string; imdbId?: string } & Record<string, unknown>) => {
      const key = (value.fingerprint ?? value.imdbId) as string;
      stores[store]?.set(key, value);
    },
    delete: async (store: string, key: string) => {
      stores[store]?.delete(key);
    },
    clear: async (store: string) => {
      stores[store]?.clear();
    },
    createObjectStore: () => ({}),
    createIndex: () => {},
  })),
}));

import { getResolved, setResolved, getRatings, setRatings } from '@/storage/cache';
import type { TitleRatings } from '@/types/omdb';

function makeRatings(over: Partial<TitleRatings> = {}): TitleRatings {
  return {
    imdbId: 'tt1',
    title: 'Inception',
    year: 2010,
    type: 'movie',
    genres: ['Sci-Fi'],
    imdbRating: 8.8,
    rtCritics: 87,
    metacritic: 74,
    fetchedAt: Date.now(),
    ...over,
  };
}

describe('cache', () => {
  beforeEach(() => {
    stores.resolved.clear();
    stores.ratings.clear();
  });

  it('round-trips a resolved fingerprint -> imdbId', async () => {
    await setResolved('inception|2010|movie', 'tt1375666');
    const id = await getResolved('inception|2010|movie');
    expect(id).toBe('tt1375666');
  });

  it('returns null for an unknown fingerprint', async () => {
    expect(await getResolved('unknown|0|movie')).toBeNull();
  });

  it('round-trips ratings and reports not-stale when fresh', async () => {
    await setRatings(makeRatings({ fetchedAt: Date.now() }));
    const r = await getRatings('tt1');
    expect(r).not.toBeNull();
    expect(r?.ratings.imdbRating).toBe(8.8);
    expect(r?.stale).toBe(false);
  });

  it('reports stale=true when older than 14 days but within 30-day TTL', async () => {
    const fifteenDaysAgo = Date.now() - 15 * 24 * 60 * 60 * 1000;
    await setRatings(makeRatings({ fetchedAt: fifteenDaysAgo }));
    const r = await getRatings('tt1');
    expect(r).not.toBeNull();
    expect(r?.stale).toBe(true);
  });

  it('evicts ratings older than the 30-day hard TTL', async () => {
    const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
    await setRatings(makeRatings({ fetchedAt: thirtyOneDaysAgo }));
    expect(await getRatings('tt1')).toBeNull();
  });

  it('evicts resolved mappings older than the 90-day TTL', async () => {
    await setResolved('inception|2010|movie', 'tt1375666');
    const rec = stores.resolved.get('inception|2010|movie') as { resolvedAt: number };
    rec.resolvedAt = Date.now() - 91 * 24 * 60 * 60 * 1000;
    stores.resolved.set('inception|2010|movie', rec);
    expect(await getResolved('inception|2010|movie')).toBeNull();
  });
});
