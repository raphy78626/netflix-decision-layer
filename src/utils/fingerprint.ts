import type { PlatformId, TitleType } from '@/types/title';

/**
 * Build a stable fingerprint for a title card so we can dedupe cache lookups
 * and in-flight requests across platforms.
 *
 * Format: platform|id|title|year|type  (e.g. `netflix|80050063|inception|2010|movie`)
 *
 * The platform + id come FIRST on purpose:
 *  - The platform's title id is unique per title on its own site, so two
 *    DIFFERENT tiles on the same platform can never share a fingerprint and
 *    therefore can never share a cached rating. This is the structural
 *    guarantee that one card's rating cannot leak onto another tile.
 *  - The platform prefix isolates the same title on different sites (Netflix
 *    vs Prime) so their OMDb lookups don't collide.
 * The same title repeated across rows on one platform shares the same id, so
 * it intentionally shares a fingerprint and reuses its cache entry.
 */
export function fingerprint(
  platform: PlatformId,
  id: string,
  title: string,
  year: number | undefined,
  type: TitleType,
): string {
  const p = platform;
  const i = id.trim();
  const t = title.trim().toLowerCase();
  const y = year ?? '';
  return `${p}|${i}|${t}|${y}|${type}`;
}

/** Cheap non-crypto hash for cache keys when needed */
export function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}
