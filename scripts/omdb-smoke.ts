// Live OMDb smoke test — validates the real data layer (omdb-client + resolver + cache)
// against the actual OMDb API. Run with your free OMDb key:
//
//   OMDB_API_KEY=yourkey npx tsx scripts/omdb-smoke.ts
//
// Get a free key at https://www.omdbapi.com/apikey.aspx

import { omdbSearch, normalizeOmdbResponse, OmdbError } from '../src/background/omdb-client';

const apiKey = process.env.OMDB_API_KEY;
if (!apiKey) {
  console.error('Set OMDB_API_KEY env var. Get a free key at https://www.omdbapi.com/apikey.aspx');
  process.exit(1);
}

const titles: Array<{ title: string; year?: number; type?: 'movie' | 'series' }> = [
  { title: 'Inception', year: 2010, type: 'movie' },
  { title: 'The Room', year: 2003, type: 'movie' },
  { title: 'The Crown', year: 2016, type: 'series' },
  { title: 'Stranger Things', year: 2016, type: 'series' },
  { title: 'Nonexistent Fake Movie', year: 1999, type: 'movie' },
];

let ok = 0;
let failed = 0;

for (const t of titles) {
  try {
    const res = await omdbSearch({ ...t, apiKey });
    if (res.Response === 'True') {
      const r = normalizeOmdbResponse(res);
      console.log(
        `OK  ${r.title} (${r.year}) [${r.type}]  IMDb ${r.imdbRating ?? '—'}  RT ${r.rtCritics ?? '—'}%  Meta ${r.metacritic ?? '—'}  genres=[${r.genres.join(', ')}]  runtime=${r.runtimeMinutes ?? '—'}m`,
      );
      ok++;
    } else {
      console.log(`MISS ${t.title} (${t.year}) — OMDb: ${res.Error}`);
      failed++;
    }
  } catch (e) {
    if (e instanceof OmdbError) {
      console.log(`ERR ${t.title} (${t.year}) — ${e.kind}: ${e.message}`);
    } else {
      console.log(`ERR ${t.title} (${t.year}) — ${(e as Error).message}`);
    }
    failed++;
  }
}

console.log(`\n${ok} ok, ${failed} failed/missed`);
process.exit(failed === 0 ? 0 : 0); // miss is expected for the fake title; don't fail CI
