import { describe, it, expect } from 'vitest';
import { ADAPTERS, getActivePlatform } from '@/content/platforms/platform';

describe('platform adapter registry', () => {
  it('registers netflix, hotstar, and primevideo adapters', () => {
    const ids = ADAPTERS.map((a) => a.id).sort();
    expect(ids).toEqual(['hotstar', 'netflix', 'primevideo']);
  });

  it('each adapter has a unique id and name', () => {
    const ids = new Set(ADAPTERS.map((a) => a.id));
    expect(ids.size).toBe(ADAPTERS.length);
    ADAPTERS.forEach((a) => expect(a.name.length).toBeGreaterThan(0));
  });
});

describe('getActivePlatform', () => {
  it('selects the netflix adapter for www.netflix.com', () => {
    expect(getActivePlatform('www.netflix.com')?.id).toBe('netflix');
  });

  it('selects the netflix adapter for netflix.com (apex)', () => {
    expect(getActivePlatform('netflix.com')?.id).toBe('netflix');
  });

  it('selects the hotstar adapter for www.hotstar.com', () => {
    expect(getActivePlatform('www.hotstar.com')?.id).toBe('hotstar');
  });

  it('selects the hotstar adapter for www.jiocinema.com', () => {
    expect(getActivePlatform('www.jiocinema.com')?.id).toBe('hotstar');
  });

  it('selects the primevideo adapter for www.primevideo.com', () => {
    expect(getActivePlatform('www.primevideo.com')?.id).toBe('primevideo');
  });

  it('selects the primevideo adapter for www.amazon.com', () => {
    expect(getActivePlatform('www.amazon.com')?.id).toBe('primevideo');
  });

  it('returns null for an unsupported host', () => {
    expect(getActivePlatform('www.example.com')).toBeNull();
    expect(getActivePlatform('localhost')).toBeNull();
  });

  it('does not cross-match (a netflix host never returns the prime adapter)', () => {
    expect(getActivePlatform('www.netflix.com')?.id).not.toBe('primevideo');
    expect(getActivePlatform('www.primevideo.com')?.id).not.toBe('netflix');
  });
});
