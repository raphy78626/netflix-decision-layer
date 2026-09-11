import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runtimeBucket, computeMatch, resetVector, recordSignal } from '@/storage/preferences';
import type { TitleRatings } from '@/types/omdb';

// Stub idb with an in-memory store for tests
const memStore = new Map<string, unknown>();

vi.mock('idb', () => ({
  openDB: vi.fn(async () => ({
    get: async (_store: string, key: string) => memStore.get(key),
    put: async (_store: string, value: { id?: string } & Record<string, unknown>) => {
      if (value.id) memStore.set(value.id, value);
    },
    clear: async (_store: string) => {
      for (const k of [...memStore.keys()]) memStore.delete(k);
    },
    createObjectStore: () => ({}),
    createIndex: () => {},
  })),
}));

function makeRatings(over: Partial<TitleRatings> = {}): TitleRatings {
  return {
    imdbId: 'tt1',
    title: 'X',
    type: 'movie',
    genres: ['Sci-Fi'],
    fetchedAt: Date.now(),
    imdbRating: 8.0,
    ...over,
  };
}

describe('runtimeBucket', () => {
  it('returns undefined for undefined', () => {
    expect(runtimeBucket(undefined)).toBeUndefined();
  });
  it('returns short for <90', () => {
    expect(runtimeBucket(80)).toBe('short');
  });
  it('returns medium for 90-149', () => {
    expect(runtimeBucket(120)).toBe('medium');
  });
  it('returns long for >=150', () => {
    expect(runtimeBucket(180)).toBe('long');
  });
});

describe('computeMatch', () => {
  beforeEach(() => {
    memStore.clear();
  });

  it('returns warming=true with IMDb proxy when cold', async () => {
    const r = makeRatings({ imdbRating: 8.2 });
    const m = await computeMatch(r);
    expect(m.warming).toBe(true);
    expect(m.matchPercent).toBe(82);
  });

  it('returns non-warming match after enough signals', async () => {
    for (let i = 0; i < 10; i++) {
      await recordSignal({
        kind: 'watched',
        imdbId: `tt${i}`,
        title: `M${i}`,
        genres: ['Sci-Fi'],
        year: 2010,
        runtimeMinutes: 130,
        type: 'movie',
        at: Date.now() + i,
      });
    }
    const m = await computeMatch(makeRatings({ genres: ['Sci-Fi'], runtimeMinutes: 130, year: 2010, type: 'movie' }));
    expect(m.warming).toBe(false);
    expect(m.matchPercent).toBeGreaterThan(0);
    expect(m.matchPercent).toBeLessThanOrEqual(100);
  });

  it('gives higher match for a liked genre vs a disliked genre', async () => {
    for (let i = 0; i < 10; i++) {
      await recordSignal({
        kind: 'watched',
        imdbId: `ttA${i}`,
        title: `A${i}`,
        genres: ['Sci-Fi'],
        year: 2010,
        type: 'movie',
        at: Date.now() + i,
      });
      await recordSignal({
        kind: 'notforme',
        imdbId: `ttR${i}`,
        title: `R${i}`,
        genres: ['Romance'],
        year: 2010,
        type: 'movie',
        at: Date.now() + i + 1000,
      });
    }
    const sciFi = await computeMatch(makeRatings({ genres: ['Sci-Fi'] }));
    const romance = await computeMatch(makeRatings({ genres: ['Romance'] }));
    expect(sciFi.matchPercent).toBeGreaterThan(romance.matchPercent);
  });

  it('resetVector clears the model', async () => {
    for (let i = 0; i < 15; i++) {
      await recordSignal({
        kind: 'watched',
        imdbId: `tt${i}`,
        title: `M${i}`,
        genres: ['Drama'],
        type: 'movie',
        at: Date.now() + i,
      });
    }
    await resetVector();
    const m = await computeMatch(makeRatings({ genres: ['Drama'] }));
    expect(m.warming).toBe(true);
  });
});
