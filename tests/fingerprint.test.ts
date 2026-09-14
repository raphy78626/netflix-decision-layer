import { describe, it, expect } from 'vitest';
import { fingerprint, hashString } from '@/utils/fingerprint';

describe('fingerprint', () => {
  it('builds platform|id|title|year|type', () => {
    expect(fingerprint('netflix', '80050063', 'Inception', 2010, 'movie')).toBe('netflix|80050063|inception|2010|movie');
  });

  it('handles missing year', () => {
    expect(fingerprint('netflix', '80050063', 'Inception', undefined, 'movie')).toBe('netflix|80050063|inception||movie');
  });

  it('trims whitespace', () => {
    expect(fingerprint('netflix', '80050063', '  Inception  ', 2010, 'movie')).toBe('netflix|80050063|inception|2010|movie');
  });

  it('is stable for same input', () => {
    expect(fingerprint('netflix', '80196012', 'The Crown', 2016, 'series')).toBe(fingerprint('netflix', '80196012', 'The Crown', 2016, 'series'));
  });

  it('differentiates by type', () => {
    expect(fingerprint('netflix', '80196012', 'The Crown', 2016, 'series')).not.toBe(fingerprint('netflix', '80196012', 'The Crown', 2016, 'movie'));
  });

  it('two DIFFERENT ids on the same platform can never share a fingerprint', () => {
    // Guard against "the same rating on every tile": even if title parsing
    // produced identical strings for two cards, their unique ids keep the
    // cache keys (and therefore the ratings) apart.
    expect(fingerprint('netflix', '80050063', 'Inception', 2010, 'movie')).not.toBe(fingerprint('netflix', '70191831', 'Inception', 2010, 'movie'));
  });

  it('same id (same title in another row) keeps one fingerprint', () => {
    expect(fingerprint('netflix', '80050063', 'Inception', 2010, 'movie')).toBe(fingerprint('netflix', ' 80050063 ', 'inception', 2010, 'movie'));
  });

  it('the platform prefix isolates the same title on different sites', () => {
    // Same id on Netflix vs Prime must NOT collide — their OMDb lookups are
    // independent and a cross-platform cache hit would be wrong.
    expect(fingerprint('netflix', '80050063', 'Inception', 2010, 'movie')).not.toBe(fingerprint('primevideo', '80050063', 'Inception', 2010, 'movie'));
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
