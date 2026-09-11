import type { TitleRatings } from '@/types/omdb';
import { SIGNAL_WEIGHT, type Signal } from './signals';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

// Lightweight preference model:
// - Per-genre affinity score (additive, weighted by signal strength)
// - Runtime bucket affinity (short/medium/long)
// - Decade affinity
// - Type affinity (movie vs series)
//
// Match score = weighted cosine similarity between user vector and title vector,
// scaled to 0-100%. Cold-start: until >=10 signals, fall back to IMDb rating.

interface PrefDB extends DBSchema {
  signals: { key: string; value: Signal & { id: string }; indexes: { 'by-imdbId': string } };
  vector: { key: string; value: UserVector };
}

interface UserVector {
  id: 'me';
  genreAffinity: Record<string, number>;
  runtimeAffinity: Record<RuntimeBucket, number>;
  decadeAffinity: Record<string, number>;
  typeAffinity: { movie: number; series: number };
  signalCount: number;
  updatedAt: number;
}

export type RuntimeBucket = 'short' | 'medium' | 'long';

const DB_NAME = 'ndl-prefs';
const DB_VERSION = 1;
const COLD_START_THRESHOLD = 10;

let dbPromise: Promise<IDBPDatabase<PrefDB>> | null = null;

function getDB(): Promise<IDBPDatabase<PrefDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PrefDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('signals')) {
          const s = db.createObjectStore('signals', { keyPath: 'id' });
          s.createIndex('by-imdbId', 'imdbId');
        }
        if (!db.objectStoreNames.contains('vector')) {
          db.createObjectStore('vector', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export async function getVector(): Promise<UserVector> {
  const db = await getDB();
  const v = await db.get('vector', 'me');
  return v ?? {
    id: 'me',
    genreAffinity: {},
    runtimeAffinity: { short: 0, medium: 0, long: 0 },
    decadeAffinity: {},
    typeAffinity: { movie: 0, series: 0 },
    signalCount: 0,
    updatedAt: Date.now(),
  };
}

export async function recordSignal(signal: Signal): Promise<UserVector> {
  const db = await getDB();
  const id = `${signal.imdbId}:${signal.kind}:${signal.at}`;
  await db.put('signals', { ...signal, id });
  const v = await getVector();
  const w = SIGNAL_WEIGHT[signal.kind];

  for (const g of signal.genres) {
    v.genreAffinity[g] = (v.genreAffinity[g] ?? 0) + w;
  }
  const bucket = runtimeBucket(signal.runtimeMinutes);
  if (bucket) v.runtimeAffinity[bucket] += w;
  if (signal.year) {
    const decade = `${Math.floor(signal.year / 10) * 10}s`;
    v.decadeAffinity[decade] = (v.decadeAffinity[decade] ?? 0) + w;
  }
  v.typeAffinity[signal.type] += w;
  v.signalCount += 1;
  v.updatedAt = Date.now();
  await db.put('vector', v);
  return v;
}

export async function resetVector(): Promise<void> {
  const db = await getDB();
  await db.clear('signals');
  await db.clear('vector');
}

export function runtimeBucket(minutes?: number): RuntimeBucket | undefined {
  if (minutes === undefined) return undefined;
  if (minutes < 90) return 'short';
  if (minutes < 150) return 'medium';
  return 'long';
}

export interface MatchResult {
  matchPercent: number;
  warming: boolean;
}

export async function computeMatch(ratings: TitleRatings): Promise<MatchResult> {
  const v = await getVector();
  if (v.signalCount < COLD_START_THRESHOLD) {
    // Cold start: use IMDb rating as proxy, scaled to 0-100
    const proxy = ratings.imdbRating !== undefined ? Math.round(ratings.imdbRating * 10) : 0;
    return { matchPercent: proxy, warming: true };
  }

  // Build title feature vector
  const titleGenres = Object.fromEntries(ratings.genres.map((g) => [g, 1]));
  const titleRuntime = runtimeBucket(ratings.runtimeMinutes);
  const titleDecade = ratings.year ? `${Math.floor(ratings.year / 10) * 10}s` : null;
  const titleType = ratings.type;

  // Cosine similarity over genre dimensions (the strongest signal)
  const userGenres = v.genreAffinity;
  let dot = 0;
  let userNorm = 0;
  let titleNorm = 0;
  const allGenres = new Set<string>([...Object.keys(userGenres), ...Object.keys(titleGenres)]);
  for (const g of allGenres) {
    const u = userGenres[g] ?? 0;
    const t = titleGenres[g] ?? 0;
    dot += u * t;
    userNorm += u * u;
    titleNorm += t * t;
  }
  const denom = Math.sqrt(userNorm) * Math.sqrt(titleNorm);
  const genreSim = denom > 0 ? dot / denom : 0;

  // Runtime bonus (0..1)
  let runtimeBonus = 0;
  if (titleRuntime) {
    const total = v.runtimeAffinity.short + v.runtimeAffinity.medium + v.runtimeAffinity.long;
    if (total > 0) {
      const positive = v.runtimeAffinity[titleRuntime];
      runtimeBonus = Math.max(0, positive / (Math.abs(total) + 1));
    }
  }

  // Decade bonus
  let decadeBonus = 0;
  if (titleDecade) {
    const total = Object.values(v.decadeAffinity).reduce((a, b) => a + b, 0);
    if (total !== 0) {
      const positive = v.decadeAffinity[titleDecade] ?? 0;
      decadeBonus = Math.max(0, positive / (Math.abs(total) + 1));
    }
  }

  // Type bonus
  let typeBonus = 0;
  const typeTotal = v.typeAffinity.movie + v.typeAffinity.series;
  if (typeTotal !== 0 && titleType) {
    typeBonus = Math.max(0, v.typeAffinity[titleType] / (Math.abs(typeTotal) + 1));
  }

  // Weighted blend: genre is dominant
  const score = 0.7 * genreSim + 0.1 * runtimeBonus + 0.1 * decadeBonus + 0.1 * typeBonus;
  const matchPercent = Math.max(0, Math.min(100, Math.round(score * 100)));
  return { matchPercent, warming: false };
}

export function _internalGetThreshold(): number {
  return COLD_START_THRESHOLD;
}
