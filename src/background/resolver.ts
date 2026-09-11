import type { NetflixTitleType } from '@/types/netflix';
import type { TitleRatings } from '@/types/omdb';
import { getResolved, getRatings, setResolved, setRatings } from '@/storage/cache';
import { omdbSearch, OmdbError, normalizeOmdbResponse } from './omdb-client';
import { tryAcquire } from './rate-limiter';

export interface ResolveInput {
  fingerprint: string;
  title: string;
  year?: number;
  type: NetflixTitleType;
  apiKey: string;
}

export type ResolveResult =
  | { status: 'cached'; ratings: TitleRatings }
  | { status: 'fresh'; ratings: TitleRatings }
  | { status: 'notfound' }
  | { status: 'rate-limited'; retryAfterMs?: number }
  | { status: 'error'; message: string };

// In-flight dedup keyed by fingerprint
const inFlight = new Map<string, Promise<ResolveResult>>();
// Fingerprints currently being refreshed in the background (stale-while-revalidate)
const refreshing = new Set<string>();

export async function resolveTitle(input: ResolveInput): Promise<ResolveResult> {
  const existing = inFlight.get(input.fingerprint);
  if (existing) return existing;

  const p = resolveTitleImpl(input).finally(() => {
    inFlight.delete(input.fingerprint);
  });
  inFlight.set(input.fingerprint, p);
  return p;
}

async function resolveTitleImpl(input: ResolveInput): Promise<ResolveResult> {
  // 1. Check resolved + ratings cache
  const imdbId = await getResolved(input.fingerprint);
  if (imdbId) {
    const cached = await getRatings(imdbId);
    if (cached) {
      // Stale-while-revalidate: serve the cached ratings immediately, and
      // kick off a background refresh so the cache stays fresh without
      // blocking the UI or duplicating work.
      if (cached.stale) {
        void refreshInBackground(input, imdbId);
      }
      return { status: 'cached', ratings: cached.ratings };
    }
  }

  // 2. Acquire rate limit token
  const rl = await tryAcquire();
  if (!rl.allowed) {
    return { status: 'rate-limited', retryAfterMs: rl.retryAfterMs };
  }

  // 3. Try OMDb with full input, then progressively relax
  const attempts: Array<{ year?: number; type?: 'movie' | 'series' }> = [
    { year: input.year, type: netflixTypeToOmdb(input.type) },
    { year: input.year },
    { type: netflixTypeToOmdb(input.type) },
    {},
  ];

  for (const attempt of attempts) {
    try {
      const res = await omdbSearch({
        title: input.title,
        year: attempt.year,
        type: attempt.type,
        apiKey: input.apiKey,
      });
      if (res.Response === 'True' && res.imdbID) {
        const ratings = normalizeOmdbResponse(res);
        await setResolved(input.fingerprint, ratings.imdbId);
        await setRatings(ratings);
        return { status: 'fresh', ratings };
      }
    } catch (e) {
      if (e instanceof OmdbError) {
        if (e.kind === 'auth') return { status: 'error', message: e.message };
        if (e.kind === 'network') return { status: 'error', message: e.message };
        // api / notfound -> try next attempt
      } else {
        return { status: 'error', message: (e as Error).message };
      }
    }
  }

  return { status: 'notfound' };
}

function netflixTypeToOmdb(t: NetflixTitleType): 'movie' | 'series' | undefined {
  if (t === 'movie') return 'movie';
  if (t === 'series') return 'series';
  return undefined;
}

/**
 * Fire-and-forget background refresh for stale-while-revalidate.
 * Re-fetches from OMDb and updates the cache. Does NOT block the caller and
 * swallows errors (the cached entry remains valid until its hard TTL).
 * Guarded by the `refreshing` set so a single stale entry isn't refreshed
 * multiple times concurrently, and respects the rate limiter.
 */
async function refreshInBackground(input: ResolveInput, knownImdbId: string): Promise<void> {
  if (refreshing.has(input.fingerprint)) return;
  refreshing.add(input.fingerprint);
  try {
    const rl = await tryAcquire();
    if (!rl.allowed) return; // try again on a future stale read
    try {
      const res = await omdbSearch({
        title: input.title,
        year: input.year,
        type: netflixTypeToOmdb(input.type),
        apiKey: input.apiKey,
      });
      if (res.Response === 'True' && res.imdbID) {
        const ratings = normalizeOmdbResponse(res);
        // Only update if it's the same title (avoid a resolver mismatch
        // overwriting our cached entry with a different title's ratings).
        if (ratings.imdbId === knownImdbId) {
          await setRatings(ratings);
        }
      }
    } catch {
      // Swallow: cached entry is still valid until hard TTL.
    }
  } finally {
    refreshing.delete(input.fingerprint);
  }
}
