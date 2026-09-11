import { describe, it, expect } from 'vitest';
import { normalizeOmdbResponse, OmdbError } from '@/background/omdb-client';
import type { OmdbResponse } from '@/types/omdb';

describe('normalizeOmdbResponse', () => {
  it('parses a full response with all three ratings', () => {
    const res: OmdbResponse = {
      Title: 'Inception',
      Year: '2010',
      Runtime: '148 min',
      Genre: 'Action, Adventure, Sci-Fi',
      Director: 'Christopher Nolan',
      Actors: 'Leonardo DiCaprio',
      Plot: 'A thief who steals corporate secrets...',
      Poster: 'https://example.com/poster.jpg',
      Metascore: '74',
      imdbRating: '8.8',
      imdbVotes: '2,500,000',
      imdbID: 'tt1375666',
      Type: 'movie',
      Ratings: [
        { Source: 'Internet Movie Database', Value: '8.8/10' },
        { Source: 'Rotten Tomatoes', Value: '87%' },
        { Source: 'Metacritic', Value: '74/100' },
      ],
      Response: 'True',
    };
    const r = normalizeOmdbResponse(res);
    expect(r.imdbId).toBe('tt1375666');
    expect(r.title).toBe('Inception');
    expect(r.year).toBe(2010);
    expect(r.type).toBe('movie');
    expect(r.imdbRating).toBe(8.8);
    expect(r.imdbVotes).toBe(2500000);
    expect(r.rtCritics).toBe(87);
    expect(r.metacritic).toBe(74);
    expect(r.genres).toEqual(['Action', 'Adventure', 'Sci-Fi']);
    expect(r.runtimeMinutes).toBe(148);
  });

  it('prefers Metascore field over Ratings array for Metacritic', () => {
    const res: OmdbResponse = {
      Title: 'Test',
      imdbID: 'tt1',
      Metascore: '90',
      Ratings: [{ Source: 'Metacritic', Value: '74/100' }],
      Response: 'True',
    };
    const r = normalizeOmdbResponse(res);
    expect(r.metacritic).toBe(90);
  });

  it('falls back to Ratings array for Metacritic when Metascore is missing', () => {
    const res: OmdbResponse = {
      Title: 'Test',
      imdbID: 'tt1',
      Ratings: [{ Source: 'Metacritic', Value: '74/100' }],
      Response: 'True',
    };
    const r = normalizeOmdbResponse(res);
    expect(r.metacritic).toBe(74);
  });

  it('handles series type', () => {
    const res: OmdbResponse = { Title: 'The Crown', imdbID: 'tt1', Type: 'series', Response: 'True' };
    expect(normalizeOmdbResponse(res).type).toBe('series');
  });

  it('treats missing Type as movie', () => {
    const res: OmdbResponse = { Title: 'X', imdbID: 'tt1', Response: 'True' };
    expect(normalizeOmdbResponse(res).type).toBe('movie');
  });

  it('rejects N/A poster', () => {
    const res: OmdbResponse = { Title: 'X', imdbID: 'tt1', Poster: 'N/A', Response: 'True' };
    expect(normalizeOmdbResponse(res).poster).toBeUndefined();
  });

  it('throws auth error when API key invalid', () => {
    const res: OmdbResponse = { Response: 'False', Error: 'Invalid API key!' };
    expect(() => normalizeOmdbResponse(res)).toThrowError(OmdbError);
  });

  it('throws notfound when no results', () => {
    const res: OmdbResponse = { Response: 'False', Error: 'Movie not found!' };
    expect(() => normalizeOmdbResponse(res)).toThrow();
  });

  it('throws when imdbID missing', () => {
    const res: OmdbResponse = { Response: 'True' } as OmdbResponse;
    expect(() => normalizeOmdbResponse(res)).toThrow();
  });

  it('parses runtime without minutes suffix gracefully', () => {
    const res: OmdbResponse = { Title: 'X', imdbID: 'tt1', Runtime: 'N/A', Response: 'True' };
    expect(normalizeOmdbResponse(res).runtimeMinutes).toBeUndefined();
  });

  it('coerces N/A ratings to undefined instead of NaN', () => {
    const res: OmdbResponse = {
      Title: 'X',
      imdbID: 'tt1',
      imdbRating: 'N/A',
      imdbVotes: 'N/A',
      Metascore: 'N/A',
      Year: 'N/A',
      Ratings: [{ Source: 'Rotten Tomatoes', Value: 'N/A%' }],
      Response: 'True',
    };
    const r = normalizeOmdbResponse(res);
    expect(r.imdbRating).toBeUndefined();
    expect(r.imdbVotes).toBeUndefined();
    expect(r.metacritic).toBeUndefined();
    expect(r.rtCritics).toBeUndefined();
    expect(r.year).toBeUndefined();
  });
});
