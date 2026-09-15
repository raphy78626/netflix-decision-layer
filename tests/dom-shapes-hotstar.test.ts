// Regression probe for the Hotstar adapter against REAL JioHotstar DOM shapes
// captured by `npm run probe:hotstar` on https://www.hotstar.com/in/movies.
import { describe, it, expect } from 'vitest';
import { hotstarAdapter } from '@/content/platforms/hotstar';
import { fingerprint } from '@/utils/fingerprint';

// Build a real /in/movies swiper card. href=/in/movies/<slug>/<id>/watch.
function movieCard(slug: string, id: string, title: string): string {
  return `<div class="swiper-slide"><div data-testid="tray-card-default"><div data-testid="tray-card-wrapper"><div data-testid="tray-card-hover"><div data-testid="action" class="h-full w-full" navigationtype="DEFAULT"><a data-testid="link" aria-label="${title}, Movie, 2 hours left" tabindex="0" href="/in/movies/${slug}/${id}/watch"><img alt="${title}" src="x.webp"/></a></div></div></div></div></div>`;
}

function verifyNoCollapse(html: string): void {
  document.body.innerHTML = html;
  const found = hotstarAdapter.findCards(document);
  expect(found.length).toBeGreaterThanOrEqual(2);
  const cards = found.map((el) => hotstarAdapter.extractCard(el)).filter((c): c is NonNullable<typeof c> => c !== null);
  expect(cards.length).toBe(found.length);
  const fps = cards.map((c) => fingerprint(c.platform, c.id, c.title, c.year, c.type));
  expect(new Set(fps).size).toBe(fps.length);
}

describe('hotstar adapter — real /in/movies DOM', () => {
  it('extracts distinct movie cards from a swiper rail (real 2026 shape)', () => {
    verifyNoCollapse(`<div class="swiper-wrapper">${movieCard('shutter-island', '1971001342', 'Shutter Island')}${movieCard('inception', '1971000530', 'Inception')}${movieCard('masaan', '1000087441', 'Masaan')}</div>`);
  });

  it('uses the slug as id, infers movie type, prefers img alt for title', () => {
    document.body.innerHTML = `<div class="swiper-wrapper">${movieCard('inception', '1971000530', 'Inception')}</div>`;
    const found = hotstarAdapter.findCards(document);
    expect(found).toHaveLength(1);
    const c = hotstarAdapter.extractCard(found[0]);
    expect(c?.platform).toBe('hotstar');
    expect(c?.id).toBe('inception');
    expect(c?.title).toBe('Inception');
    expect(c?.type).toBe('movie');
  });

  it('parses the aria-label title when no img alt is present', () => {
    document.body.innerHTML = `<div class="swiper-wrapper"><div class="swiper-slide"><div data-testid="tray-card-default"><div data-testid="tray-card-wrapper"><div data-testid="tray-card-hover"><div data-testid="action" class="h-full w-full"><a data-testid="link" aria-label="Pacific Rim: Uprising, Movie, 11 minutes left" href="/in/movies/pacific-rim-uprising/1971000777/watch"></a></div></div></div></div></div></div>`;
    const found = hotstarAdapter.findCards(document);
    expect(found).toHaveLength(1);
    const c = hotstarAdapter.extractCard(found[0]);
    expect(c?.title).toBe('Pacific Rim: Uprising');
    expect(c?.id).toBe('pacific-rim-uprising');
    expect(c?.type).toBe('movie');
  });

  it('nav tabs (role=tab, linkuntabbable) are NOT treated as cards', () => {
    document.body.innerHTML = `
      <div data-testid="action" class="outline-none" linkuntabbable="true" linkrole="tab"><a data-testid="link" role="tab" aria-label="Movies" href="/in/movies"></a></div>
      <div class="swiper-wrapper">${movieCard('inception', '1971000530', 'Inception')}${movieCard('masaan', '1000087441', 'Masaan')}</div>`;
    const found = hotstarAdapter.findCards(document);
    expect(found).toHaveLength(2);
    const titles = found.map((el) => hotstarAdapter.extractCard(el)?.title).sort();
    expect(titles).toEqual(['Inception', 'Masaan']);
  });

  it('episode and live-stream cards are skipped', () => {
    const ep = `<div class="swiper-slide"><div data-testid="tray-card-default"><div data-testid="tray-card-wrapper"><div data-testid="tray-card-hover"><div data-testid="action" class="h-full w-full"><a data-testid="link" aria-label="BBHin Day 08, Clip, 1 hours" href="/in/shows/bigg-boss/1971002586/bbhin-day-08/1271696763/watch"><img alt="BBHin Day 08" src="x.webp"/></a></div></div></div></div></div>`;
    const live = `<div class="swiper-slide"><div data-testid="tray-card-default"><div data-testid="tray-card-wrapper"><div data-testid="tray-card-hover"><div data-testid="action" class="h-full w-full"><a data-testid="link" aria-label="BBS20 Live" href="/in/shows/bbs20/1271698275/live/watch"><img alt="BBS20 Live" src="x.webp"/></a></div></div></div></div></div>`;
    document.body.innerHTML = `<div class="swiper-wrapper">${ep}${live}${movieCard('inception', '1971000530', 'Inception')}</div>`;
    const found = hotstarAdapter.findCards(document);
    // findCards returns all 3 anchors, but extractCard skips episode + live.
    const cards = found.map((el) => hotstarAdapter.extractCard(el)).filter((c): c is NonNullable<typeof c> => c !== null);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.title).toBe('Inception');
  });

  it('ads (data-testid=ad-media) are NOT treated as cards', () => {
    document.body.innerHTML = `
      <div class="nbZYiO46kfCThSWlVH2UL" data-testid="ad-media"><a data-testid="link" href="/in/movies/some-ad/1/watch"><img alt="Build Ambitious Apps" src="x.jpg"/></a></div>
      <div class="swiper-wrapper">${movieCard('inception', '1971000530', 'Inception')}${movieCard('masaan', '1000087441', 'Masaan')}</div>`;
    const found = hotstarAdapter.findCards(document);
    expect(found).toHaveLength(2);
    const titles = found.map((el) => hotstarAdapter.extractCard(el)?.title).sort();
    expect(titles).toEqual(['Inception', 'Masaan']);
  });
});
