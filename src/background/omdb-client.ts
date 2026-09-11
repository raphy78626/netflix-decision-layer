import type { OmdbResponse, TitleRatings } from '@/types/omdb';

const OMDB_BASE = 'https://www.omdbapi.com/';

export class OmdbError extends Error {
  constructor(message: string, public readonly kind: 'network' | 'api' | 'auth' | 'notfound') {
    super(message);
    this.name = 'OmdbError';
  }
}

function parseRuntimeMinutes(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const m = s.match(/(\d+)\s*min/i);
  return m ? parseInt(m[1], 10) : undefined;
}

/** Parse a numeric string, returning undefined for missing / "N/A" / NaN. */
function parseFiniteNumber(s: string | undefined, parse: (raw: string) => number): number | undefined {
  if (!s || s === 'N/A') return undefined;
  const n = parse(s);
  return Number.isFinite(n) ? n : undefined;
}

function parseRatingValue(entries: { Source: string; Value: string }[] | undefined, source: string): number | undefined {
  if (!entries) return undefined;
  const e = entries.find((r) => r.Source === source);
  if (!e) return undefined;
  // "8.7/10" -> 8.7 ; "73%" -> 73 ; "74/100" -> 74
  const v = e.Value;
  if (v.endsWith('%')) return parseFiniteNumber(v, (s) => parseInt(s, 10));
  const slash = v.split('/');
  if (slash.length === 2) return parseFiniteNumber(slash[0], (s) => parseFloat(s));
  return undefined;
}

export function normalizeOmdbResponse(res: OmdbResponse): TitleRatings {
  if (res.Response === 'False') {
    throw new OmdbError(res.Error ?? 'OMDb returned false', res.Error?.includes('API key') ? 'auth' : 'notfound');
  }
  if (!res.imdbID) throw new OmdbError('No imdbID in response', 'api');

  return {
    imdbId: res.imdbID,
    title: res.Title ?? '',
    year: parseFiniteNumber(res.Year, (s) => parseInt(s, 10)),
    type: (res.Type === 'series' ? 'series' : 'movie'),
    imdbRating: parseFiniteNumber(res.imdbRating, (s) => parseFloat(s)),
    imdbVotes: parseFiniteNumber(res.imdbVotes, (s) => parseInt(s.replace(/,/g, ''), 10)),
    rtCritics: parseRatingValue(res.Ratings, 'Rotten Tomatoes'),
    metacritic: parseFiniteNumber(res.Metascore, (s) => parseInt(s, 10)) ?? parseRatingValue(res.Ratings, 'Metacritic'),
    genres: res.Genre ? res.Genre.split(',').map((g) => g.trim()) : [],
    runtimeMinutes: parseRuntimeMinutes(res.Runtime),
    plot: res.Plot,
    poster: res.Poster && res.Poster !== 'N/A' ? res.Poster : undefined,
    director: res.Director && res.Director !== 'N/A' ? res.Director : undefined,
    actors: res.Actors && res.Actors !== 'N/A' ? res.Actors : undefined,
    fetchedAt: Date.now(),
  };
}

export async function omdbSearch(params: {
  title: string;
  year?: number;
  type?: 'movie' | 'series';
  apiKey: string;
}): Promise<OmdbResponse> {
  const u = new URL(OMDB_BASE);
  u.searchParams.set('t', params.title);
  if (params.year) u.searchParams.set('y', String(params.year));
  if (params.type) u.searchParams.set('type', params.type);
  u.searchParams.set('apikey', params.apiKey);

  let res: Response;
  try {
    res = await fetch(u.toString(), { method: 'GET' });
  } catch (e) {
    throw new OmdbError(`Network error: ${(e as Error).message}`, 'network');
  }
  if (!res.ok) {
    if (res.status === 401) throw new OmdbError('Invalid API key', 'auth');
    throw new OmdbError(`HTTP ${res.status}`, 'api');
  }
  let body: OmdbResponse;
  try {
    body = (await res.json()) as OmdbResponse;
  } catch {
    throw new OmdbError('Invalid JSON response', 'api');
  }
  return body;
}
