// Regression probe: exercise findCards + extractCard + fingerprint over
// realistic "modern Netflix" DOM shapes and assert that per-tile badges can
// NEVER all collapse onto the same fingerprint. One shape collapsing is
// exactly the "same rating shows on every tile" bug.
import { describe, it, expect } from 'vitest';
import { findCards, extractCard } from '@/content/extractor';
import { fingerprint } from '@/utils/fingerprint';

function verifyNoCollapse(html: string): void {
  document.body.innerHTML = html;
  const found = findCards(document);
  expect(found.length).toBeGreaterThanOrEqual(2);
  const cards = found
    .map((el) => extractCard(el))
    .filter((c): c is NonNullable<typeof c> => c !== null);
  expect(cards.length).toBe(found.length); // every detected card must extract
  const fps = cards.map((c) => fingerprint(c.netflixId, c.title, c.year, c.type));
  expect(new Set(fps).size).toBe(fps.length); // no two cards share a fingerprint
}

describe('fingerprint collapse probe (no "same rating on every tile")', () => {
  it('aria-label on per-title container (classic shape)', () => {
    verifyNoCollapse(`
      <div class="row">
        <div class="title-card" data-id="80050063" aria-label="Inception (2010) - 16+ - 2h 28m - Sci-Fi Movies">
          <a href="/title/80050063"></a><div class="fallback-text">Inception</div>
        </div>
        <div class="title-card" data-id="70191831" aria-label="The Room (2003) - 18+ - 1h 39m - Independent Movies">
          <a href="/title/70191831"></a><div class="fallback-text">The Room</div>
        </div>
      </div>
    `);
  });

  it('aria-label only on the poster link', () => {
    verifyNoCollapse(`
      <div class="row">
        <div class="title-card" data-id="80050063">
          <a href="/title/80050063" aria-label="Inception (2010) - 16+ - Sci-Fi Movies">
            <div class="fallback-text">Inception</div>
          </a>
        </div>
        <div class="title-card" data-id="70191831">
          <a href="/title/70191831" aria-label="The Room (2003) - 18+ - Independent Movies">
            <div class="fallback-text">The Room</div>
          </a>
        </div>
      </div>
    `);
  });

  it('generic FIRST aria-label ("Play" button) before the title — the collapse shape', () => {
    // Old behavior: every card extracted "Play" -> one fingerprint -> the same
    // rating stamped on every tile. The title link's own aria-label must win.
    verifyNoCollapse(`
      <div class="row">
        <div class="card" data-id="80050063">
          <button aria-label="Play">▶</button>
          <a href="/title/80050063" aria-label="Inception (2010) - Sci-Fi Movies"></a>
        </div>
        <div class="card" data-id="70191831">
          <button aria-label="Play">▶</button>
          <a href="/title/70191831" aria-label="The Room (2003) - Independent Movies"></a>
        </div>
      </div>
    `);
  });

  it('generic "Details" aria-label on every poster link, title in .fallback-text', () => {
    verifyNoCollapse(`
      <div class="row">
        <div class="title-card" data-id="80050063">
          <a href="/title/80050063" aria-label="Details"><div class="fallback-text">Inception</div></a>
        </div>
        <div class="title-card" data-id="70191831">
          <a href="/title/70191831" aria-label="Details"><div class="fallback-text">The Room</div></a>
        </div>
      </div>
    `);
  });

  it('row-level tracking context must not merge tiles into one container', () => {
    verifyNoCollapse(`
      <div data-ui-tracking-context="row">
        <div class="slider-item"><a href="/title/80050063" aria-label="Inception (2010) - Sci-Fi Movies"></a></div>
        <div class="slider-item"><a href="/title/70191831" aria-label="The Room (2003) - Independent Movies"></a></div>
      </div>
    `);
  });

  it('no recognizable card classes: fallback walk must stop at the per-item wrapper', () => {
    verifyNoCollapse(`
      <div class="card-groups">
        <div class="slider-content">
          <div class="slider-item"><a href="/title/80050063" aria-label="Inception (2010) - Sci-Fi Movies"></a></div>
          <div class="slider-item"><a href="/title/70191831" aria-label="The Room (2003) - Independent Movies"></a></div>
        </div>
      </div>
    `);
  });

  it('title link wrapped in a small boxart wrapper (real-Netflix shape)', () => {
    // Regression: the title link sits inside a small boxart/poster wrapper
    // that contains only that one link. The "tightest single-title ancestor"
    // walk used to stop at the wrapper, but the title text + container
    // aria-label live one level higher in `.title-card` -> extractCard
    // returned null for EVERY card -> no badges rendered at all.
    verifyNoCollapse(`
      <div class="row">
        <div class="title-card" data-id="80050063" aria-label="Inception (2010) - 16+ - 2h 28m - Sci-Fi Movies">
          <div class="boxart-wrapper"><a href="/title/80050063"><img src="poster.jpg"/></a></div>
          <div class="fallback-text">Inception</div>
        </div>
        <div class="title-card" data-id="70191831" aria-label="The Room (2003) - 18+ - 1h 39m - Independent Movies">
          <div class="boxart-wrapper"><a href="/title/70191831"><img src="poster.jpg"/></a></div>
          <div class="fallback-text">The Room</div>
        </div>
      </div>
    `);
  });

  it('dashed titles stay distinct after the parser fix', () => {
    // "Spider-Man" must not truncate to "Spider" — and even if title parsing
    // ever collapsed, netflixId inside the fingerprint keeps the keys apart.
    verifyNoCollapse(`
      <div class="row">
        <div class="title-card" data-id="2250912"><a href="/title/2250912" aria-label="Spider-Man: Homecoming (2017) - Movie"></a></div>
        <div class="title-card" data-id="80057281"><a href="/title/80057281" aria-label="Stranger Things (2016) - TV Series"></a></div>
      </div>
    `);
  });

  it('preview modal, notification bell, and play-button row are NOT treated as cards', () => {
    // Real Netflix surfaces these non-card elements that contain numeric
    // /title/ or /watch/ links. They must be filtered out by findCards so
    // they never produce badges or spam the diagnostic dump.
    document.body.innerHTML = `
      <div class="previewModal--info">
        <a href="/title/82853382?dpRightClick=1"></a>
        <div class="buttonControls--container" data-uia="mini-modal-controls">
          <a href="/watch/82853382" aria-label="Play"></a>
        </div>
      </div>
      <div data-uia="navigation+notifications+items">
        <a data-uia="navigation+notifications+item" href="/title/82917743?trkid=1">
          <img alt="NFL Melbourne Game: 49ers vs Rams" src="x.jpg"/>
        </a>
      </div>
      <div class="row">
        <div class="title-card" data-id="80050063"><a href="/title/80050063" aria-label="Inception (2010) - Movie"></a></div>
        <div class="title-card" data-id="70191831"><a href="/title/70191831" aria-label="The Room (2003) - Movie"></a></div>
      </div>
    `;
    const found = findCards(document);
    expect(found).toHaveLength(2);
    const titles = found.map((el) => extractCard(el)?.title).sort();
    expect(titles).toEqual(['Inception', 'The Room']);
  });

  it('modern browse grid: a[data-uia="standard-card"] with href="/browse?jbv=NNNN" (real 2026 Netflix shape)', () => {
    // Captured from real netflix.com/browse: the card IS an <a> with
    // data-uia="standard-card", href="/browse?jbv=NNNN", and aria-label equal to
    // the bare title (no year/type). The old /title/ selectors missed these
    // entirely -> no cards found -> no badges.
    verifyNoCollapse(`
      <div class="row">
        <div class="slider-item"><a href="/browse?jbv=81748484" tabindex="0" aria-label="Genie, Make a Wish" data-uia="standard-card"><div><div><img alt="" src="x.webp"/></div></div></a></div>
        <div class="slider-item"><a href="/browse?jbv=81243992" tabindex="0" aria-label="It's Okay to Not Be Okay" data-uia="standard-card"><div><div><img alt="" src="x.webp"/></div></div></a></div>
      </div>
    `);
  });

  it('short real titles like "You" and "GDN" are accepted (not rejected as chrome)', () => {
    document.body.innerHTML = `
      <div class="row">
        <div class="slider-item"><a href="/browse?jbv=80211991" aria-label="You" data-uia="standard-card"><img alt="" src="x.webp"/></a></div>
        <div class="slider-item"><a href="/browse?jbv=82853382" aria-label="GDN" data-uia="standard-card"><img alt="" src="x.webp"/></a></div>
      </div>
    `;
    const found = findCards(document);
    expect(found).toHaveLength(2);
    const titles = found.map((el) => extractCard(el)?.title).sort();
    expect(titles).toEqual(['GDN', 'You']);
  });

  it('ranked-card and progress-card variants also resolve', () => {
    verifyNoCollapse(`
      <div class="row">
        <div class="slider-item"><a href="/browse?jbv=80050063" aria-label="Inception" data-uia="ranked-card"><img alt="" src="x.webp"/></a></div>
        <div class="slider-item"><a href="/browse?jbv=70191831" aria-label="The Room" data-uia="progress-card"><img alt="" src="x.webp"/></a></div>
      </div>
    `);
  });
});