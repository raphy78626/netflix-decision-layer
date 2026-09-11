import type { NetflixTitleType } from '@/types/netflix';

/**
 * Build a stable fingerprint for a Netflix card so we can dedupe cache lookups
 * and in-flight requests.
 *
 * Format: netflixId|title|year|type  (e.g. `80050063|inception|2010|movie`)
 *
 * The Netflix title ID comes FIRST on purpose: it is unique per title, so two
 * DIFFERENT tiles can never share a fingerprint and therefore can never share
 * a cached rating. This is the structural guarantee that one card's rating
 * cannot leak onto another tile, even if title parsing is noisy. The same title
 * repeated across rows shares the same ID, so it intentionally shares a
 * fingerprint and reuses its cache entry.
 */
export function fingerprint(
  netflixId: string,
  title: string,
  year: number | undefined,
  type: NetflixTitleType,
): string {
  const id = netflixId.trim();
  const t = title.trim().toLowerCase();
  const y = year ?? '';
  return `${id}|${t}|${y}|${type}`;
}

/** Cheap non-crypto hash for cache keys when needed */
export function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}