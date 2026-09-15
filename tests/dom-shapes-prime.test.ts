// Regression probe for the Prime Video adapter against REAL primevideo.com DOM
// shapes captured by `npm run probe:prime`.
import { describe, it, expect } from 'vitest';
import { primevideoAdapter } from '@/content/platforms/primevideo';
import { fingerprint } from '@/utils/fingerprint';

// A Prime hero title exposes 3 anchors with the same /detail/<id> href:
//   1. hero bg image link (a.VfXkrJ, aria-label=title)
//   2. title-art logo link (<h2 data-testid="title-art"> inner <a>)
//   3. "More details" CTA (a[data-testid="details-cta"])
// All three must collapse to ONE card (id-dedup), and the CTA excluded.
function heroTitle(id: string, title: string): string {
  const href = `/detail/${id}?jic=16&ref_=atv_hm_hom_c_xxx`;
  return `
    <div class="vMn1Fp" data-animate-hero-background="true">
      <a class="VfXkrJ" aria-label="${title}" href="${href}"><img alt="Desktop Home FBs" src="x.jpg"/></a>
    </div>
    <h2 data-testid="title-art" aria-label="${title}"><a href="${href}" tabindex="-1" aria-hidden="true"><img alt="${title}" src="logo.png"/></a></h2>
    <div data-testid="action-box"><a data-testid="details-cta" aria-label="More details for ${title}" href="${href}"><span>More details</span></a></div>`;
}

describe('primevideo adapter — real home/hero DOM', () => {
  it('collapses a hero title\'s 3 anchors to ONE card with the clean title', () => {
    document.body.innerHTML = heroTitle('0NKG56HP2PUMR4FPMWQVZIUOSP', 'Magudam');
    const found = primevideoAdapter.findCards(document);
    expect(found).toHaveLength(1);
    const c = primevideoAdapter.extractCard(found[0]);
    expect(c?.platform).toBe('primevideo');
    expect(c?.id).toBe('0NKG56HP2PUMR4FPMWQVZIUOSP');
    expect(c?.title).toBe('Magudam');
  });

  it('extracts distinct titles from multiple heroes (no fingerprint collapse)', () => {
    document.body.innerHTML = heroTitle('0NKG56HP2PUMR4FPMWQVZIUOSP', 'Magudam') + heroTitle('0GPE7W7O8MQLO2RIWAGVJTUOSH', 'Deool Band 2') + heroTitle('0RTM3CEQ6WUPHVB99HPXAZQ1O3', 'Heartbeats, Pyaar Aur Armaan');
    const found = primevideoAdapter.findCards(document);
    expect(found).toHaveLength(3);
    const cards = found.map((el) => primevideoAdapter.extractCard(el)).filter((c): c is NonNullable<typeof c> => c !== null);
    expect(cards.length).toBe(3);
    const fps = cards.map((c) => fingerprint(c.platform, c.id, c.title, c.year, c.type));
    expect(new Set(fps).size).toBe(3);
    const titles = cards.map((c) => c.title).sort();
    expect(titles).toEqual(['Deool Band 2', 'Heartbeats, Pyaar Aur Armaan', 'Magudam']);
  });

  it('ignores the generic "Desktop Home FBs" img alt and uses aria-label', () => {
    document.body.innerHTML = `
      <div class="vMn1Fp"><a class="VfXkrJ" aria-label="The Revolutionaries" href="/detail/0OZLPAWGI1BY45ROKWD7ZKS2VS?ref_=x"><img alt="Desktop Home FBs" src="x.jpg"/></a></div>`;
    const found = primevideoAdapter.findCards(document);
    expect(found).toHaveLength(1);
    const c = primevideoAdapter.extractCard(found[0]);
    expect(c?.title).toBe('The Revolutionaries');
    expect(c?.id).toBe('0OZLPAWGI1BY45ROKWD7ZKS2VS');
  });

  it('nav links (pv-nav-*) are NOT treated as cards', () => {
    document.body.innerHTML = `
      <li><a data-testid="pv-nav-home-movies" aria-label="Movies" href="/movie?ref_=x">Movies</a></li>
      <li><a data-testid="pv-nav-sign-in" aria-label="Sign In" href="/auth-redirect?signin=1">Sign In</a></li>
      ${heroTitle('0NKG56HP2PUMR4FPMWQVZIUOSP', 'Magudam')}`;
    const found = primevideoAdapter.findCards(document);
    expect(found).toHaveLength(1);
    expect(primevideoAdapter.extractCard(found[0])?.title).toBe('Magudam');
  });

  it('the "More details" CTA alone (no hero bg) is not treated as a card', () => {
    document.body.innerHTML = `
      <div data-testid="action-box"><a data-testid="details-cta" aria-label="More details for Magudam" href="/detail/0NKG56HP2PUMR4FPMWQVZIUOSP?ref_=x"><span>More details</span></a></div>`;
    const found = primevideoAdapter.findCards(document);
    expect(found).toHaveLength(0);
  });
});
