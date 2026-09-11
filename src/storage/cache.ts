import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { TitleRatings } from '@/types/omdb';

// Two stores:
// - resolved: fingerprint -> imdbId (long-lived mapping)
// - ratings:  imdbId -> TitleRatings (refreshed periodically)

interface NdlDB extends DBSchema {
  resolved: {
    key: string; // fingerprint
    value: { fingerprint: string; imdbId: string; resolvedAt: number };
    indexes: { 'by-imdbId': string };
  };
  ratings: {
    key: string; // imdbId
    value: TitleRatings;
    indexes: { 'by-fetchedAt': number };
  };
}

const DB_NAME = 'ndl-cache';
const DB_VERSION = 1;

// Ratings (IMDb / RT / Metacritic) barely change over time, so we cache them
// for a long time to minimize OMDb calls. Resolved ID mappings are even more
// stable (a title's IMDb ID never changes), so they get a longer TTL.
// Stale-while-revalidate: serve cached ratings immediately but refresh in
// the background once they're older than STALE_REFRESH_MS.
const RATINGS_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RESOLVED_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const STALE_REFRESH_MS = 14 * 24 * 60 * 60 * 1000; // refresh in bg if older than 14 days

let dbPromise: Promise<IDBPDatabase<NdlDB>> | null = null;

function getDB(): Promise<IDBPDatabase<NdlDB>> {
  if (!dbPromise) {
    dbPromise = openDB<NdlDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('resolved')) {
          const s = db.createObjectStore('resolved', { keyPath: 'fingerprint' });
          s.createIndex('by-imdbId', 'imdbId');
        }
        if (!db.objectStoreNames.contains('ratings')) {
          const s = db.createObjectStore('ratings', { keyPath: 'imdbId' });
          s.createIndex('by-fetchedAt', 'fetchedAt');
        }
      },
    });
  }
  return dbPromise;
}

export async function getResolved(fingerprint: string): Promise<string | null> {
  const db = await getDB();
  const rec = await db.get('resolved', fingerprint);
  if (!rec) return null;
  if (Date.now() - rec.resolvedAt > RESOLVED_TTL_MS) {
    await db.delete('resolved', fingerprint);
    return null;
  }
  return rec.imdbId;
}

export async function setResolved(fingerprint: string, imdbId: string): Promise<void> {
  const db = await getDB();
  await db.put('resolved', { fingerprint, imdbId, resolvedAt: Date.now() });
}

export async function getRatings(
  imdbId: string,
): Promise<{ ratings: TitleRatings; stale: boolean } | null> {
  const db = await getDB();
  const r = await db.get('ratings', imdbId);
  if (!r) return null;
  const age = Date.now() - r.fetchedAt;
  if (age > RATINGS_TTL_MS) {
    await db.delete('ratings', imdbId);
    return null;
  }
  return { ratings: r, stale: age > STALE_REFRESH_MS };
}

export async function setRatings(ratings: TitleRatings): Promise<void> {
  const db = await getDB();
  await db.put('ratings', ratings);
}

/** Test helper: reset all stores */
export async function _clearAll(): Promise<void> {
  const db = await getDB();
  await db.clear('resolved');
  await db.clear('ratings');
}
