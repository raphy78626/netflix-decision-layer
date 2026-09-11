import { describe, it, expect } from 'vitest';
import { evaluateFilter } from '@/content/filter';
import type { TitleRatings } from '@/types/omdb';
import { DEFAULT_SETTINGS, type Settings } from '@/storage/settings';

function makeRatings(over: Partial<TitleRatings> = {}): TitleRatings {
  return {
    imdbId: 'tt1',
    title: 'X',
    type: 'movie',
    genres: [],
    fetchedAt: Date.now(),
    imdbRating: 8.0,
    rtCritics: 80,
    metacritic: 70,
    ...over,
  };
}

describe('evaluateFilter', () => {
  it('passes everything when filter disabled', () => {
    const s: Settings = { ...DEFAULT_SETTINGS, filterEnabled: false, minImdb: 9 };
    const d = evaluateFilter(makeRatings(), s);
    expect(d.pass).toBe(true);
    expect(d.fade).toBe(false);
  });

  it('passes when ratings null (unknown)', () => {
    const s: Settings = { ...DEFAULT_SETTINGS, filterEnabled: true, minImdb: 7 };
    expect(evaluateFilter(null, s).pass).toBe(true);
  });

  it('passes when ratings meet thresholds', () => {
    const s: Settings = { ...DEFAULT_SETTINGS, filterEnabled: true, minImdb: 7, minRt: 70, minMetacritic: 60 };
    const d = evaluateFilter(makeRatings({ imdbRating: 8, rtCritics: 80, metacritic: 70 }), s);
    expect(d.pass).toBe(true);
    expect(d.fade).toBe(false);
  });

  it('fades when below threshold in fade mode', () => {
    const s: Settings = { ...DEFAULT_SETTINGS, filterEnabled: true, minImdb: 9, filterMode: 'fade' };
    const d = evaluateFilter(makeRatings({ imdbRating: 5 }), s);
    expect(d.pass).toBe(true);
    expect(d.fade).toBe(true);
  });

  it('hides when below threshold in hide mode', () => {
    const s: Settings = { ...DEFAULT_SETTINGS, filterEnabled: true, minImdb: 9, filterMode: 'hide' };
    const d = evaluateFilter(makeRatings({ imdbRating: 5 }), s);
    expect(d.pass).toBe(false);
    expect(d.fade).toBe(false);
  });

  it('treats zero threshold as no constraint', () => {
    const s: Settings = { ...DEFAULT_SETTINGS, filterEnabled: true, minImdb: 0, minRt: 0, minMetacritic: 0 };
    const d = evaluateFilter(makeRatings({ imdbRating: 1, rtCritics: 1, metacritic: 1 }), s);
    expect(d.pass).toBe(true);
  });

  it('fails when one of three thresholds not met', () => {
    const s: Settings = { ...DEFAULT_SETTINGS, filterEnabled: true, minImdb: 7, minRt: 70, minMetacritic: 90, filterMode: 'hide' };
    const d = evaluateFilter(makeRatings({ imdbRating: 8, rtCritics: 80, metacritic: 70 }), s);
    expect(d.pass).toBe(false);
  });
});
