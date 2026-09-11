import { describe, it, expect } from 'vitest';
import { fingerprint, hashString } from '@/utils/fingerprint';

describe('fingerprint', () => {
  it('builds netflixId|title|year|type', () => {
    expect(fingerprint('80050063', 'Inception', 2010, 'movie')).toBe('80050063|inception|2010|movie');
  });

  it('handles missing year', () => {
    expect(fingerprint('80050063', 'Inception', undefined, 'movie')).toBe('80050063|inception||movie');
  });

  it('trims whitespace', () => {
    expect(fingerprint('80050063', '  Inception  ', 2010, 'movie')).toBe('80050063|inception|2010|movie');
  });

  it('is stable for same input', () => {
    expect(fingerprint('80196012', 'The Crown', 2016, 'series')).toBe(fingerprint('80196012', 'The Crown', 2016, 'series'));
  });

  it('differentiates by type', () => {
    expect(fingerprint('80196012', 'The Crown', 2016, 'series')).not.toBe(fingerprint('80196012', 'The Crown', 2016, 'movie'));
  });

  it('two DIFFERENT netflixIds can never share a fingerprint even with identical metadata', () => {
    // This is the guard against "the same rating on every tile": even if title
    // parsing produced identical strings for two cards, their unique Netflix
    // IDs keep the cache keys (and therefore the ratings) apart.
    expect(fingerprint('80050063', 'Inception', 2010, 'movie')).not.toBe(fingerprint('70191831', 'Inception', 2010, 'movie'));
  });

  it('same netflixId (same title in another row) keeps one fingerprint', () => {
    expect(fingerprint('80050063', 'Inception', 2010, 'movie')).toBe(fingerprint(' 80050063 ', 'inception', 2010, 'movie'));
  });
});

describe('hashString', () => {
  it('returns a short base36 string', () => {
    expect(hashString('hello')).toMatch(/^[0-9a-z]+$/);
  });

  it('is deterministic', () => {
    expect(hashString('hello')).toBe(hashString('hello'));
  });

  it('differs for different inputs', () => {
    expect(hashString('a')).not.toBe(hashString('b'));
  });
});