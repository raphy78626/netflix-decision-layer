import { describe, it, expect } from 'vitest';
import { parseAriaLabel, extractCard, findCards } from '@/content/extractor';

describe('parseAriaLabel', () => {
  it('parses title + year + movie', () => {
    const r = parseAriaLabel('Inception (2010) - 16+ - 2h 28m - Sci-Fi Movies');
    expect(r.title).toBe('Inception');
    expect(r.year).toBe(2010);
    expect(r.type).toBe('movie');
  });

  it('parses TV series', () => {
    const r = parseAriaLabel('The Crown (2016) - TV Series');
    expect(r.title).toBe('The Crown');
    expect(r.year).toBe(2016);
    expect(r.type).toBe('series');
  });

  it('parses Netflix series without year', () => {
    const r = parseAriaLabel('Stranger Things - Netflix Series');
    expect(r.title).toBe('Stranger Things');
    expect(r.type).toBe('series');
    expect(r.year).toBeUndefined();
  });

  it('parses episode type', () => {
    const r = parseAriaLabel('Chapter One: The Vanishing of Will Byers (2016) - Episode');
    expect(r.type).toBe('episode');
  });

  it('keeps an UNSPACED dash inside the title', () => {
    // Regression: the old parser split on ANY dash and truncated
    // "Spider-Man: Homecoming" to "Spider".
    const r = parseAriaLabel('Spider-Man: Homecoming (2017) - Movie');
    expect(r.title).toBe('Spider-Man: Homecoming');
    expect(r.year).toBe(2017);
    expect(r.type).toBe('movie');
  });

  it('keeps an unspaced dash when there is no year', () => {
    const r = parseAriaLabel('The Witcher: Blood Origin - Netflix Series');
    expect(r.title).toBe('The Witcher: Blood Origin');
    expect(r.type).toBe('series');
  });

  it('handles em/en dashes as separators', () => {
    expect(parseAriaLabel('Dune: Part Two – Limited Series').title).toBe('Dune: Part Two');
    expect(parseAriaLabel('The Queen’s Gambit — TV Series').title).toBe('The Queen’s Gambit');
  });
});

describe('extractCard', () => {
  it('extracts from a card with data-id and aria-label', () => {
    const el = document.createElement('div');
    el.setAttribute('data-id', '80050063');
    el.setAttribute('aria-label', 'Inception (2010) - 16+ - Sci-Fi Movies');
    const card = extractCard(el);
    expect(card).not.toBeNull();
    expect(card?.netflixId).toBe('80050063');
    expect(card?.title).toBe('Inception');
    expect(card?.year).toBe(2010);
    expect(card?.type).toBe('movie');
  });

  it('extracts from a link-based card', () => {
    const el = document.createElement('div');
    const link = document.createElement('a');
    link.href = '/title/80050063';
    const fallback = document.createElement('div');
    fallback.className = 'fallback-text';
    fallback.textContent = 'Inception';
    el.appendChild(link);
    el.appendChild(fallback);
    const card = extractCard(el);
    expect(card).not.toBeNull();
    expect(card?.netflixId).toBe('80050063');
    expect(card?.title).toBe('Inception');
  });

  it('prefers the title link aria-label over the container aria-label', () => {
    const el = document.createElement('div');
    el.setAttribute('data-id', '80050063');
    el.setAttribute('aria-label', 'The Room (2003) - Movie'); // container: wrong/shared title
    const link = document.createElement('a');
    link.href = '/title/80050063';
    link.setAttribute('aria-label', 'Inception (2010) - Sci-Fi Movies'); // per-tile truth
    el.appendChild(link);
    const card = extractCard(el);
    expect(card?.title).toBe('Inception');
    expect(card?.year).toBe(2010);
  });

  it('reads the title from the link aria-label even when a generic first-[aria-label] element exists', () => {
    // Regression for the observed bug: modern Netflix cards can contain a
    // generic first [aria-label] (e.g. a "Play" button) BEFORE the real title
    // link. The old code grabbed that generic string ("Play") for EVERY card,
    // giving every tile the same fingerprint -> same rating.
    const el = document.createElement('div');
    el.setAttribute('data-id', '80050063');
    const btn = document.createElement('button');
    btn.setAttribute('aria-label', 'Play');
    btn.textContent = '▶';
    const link = document.createElement('a');
    link.href = '/title/80050063';
    link.setAttribute('aria-label', 'Inception (2010) - 16+ - Sci-Fi Movies');
    const fallback = document.createElement('div');
    fallback.className = 'fallback-text';
    fallback.textContent = 'Inception';
    link.appendChild(fallback);
    el.appendChild(btn); // generic aria comes FIRST in DOM order
    el.appendChild(link);
    const card = extractCard(el);
    expect(card?.title).toBe('Inception');
  });

  it('falls back to the card .fallback-text when the link has a generic aria-label', () => {
    // Netflix variant where the poster link's aria-label is the generic string
    // "Details": the real title lives in .fallback-text.
    const el = document.createElement('div');
    el.setAttribute('data-id', '80050063');
    const link = document.createElement('a');
    link.href = '/title/80050063';
    link.setAttribute('aria-label', 'Details');
    const fallback = document.createElement('div');
    fallback.className = 'fallback-text';
    fallback.textContent = 'Inception';
    link.appendChild(fallback);
    el.appendChild(link);
    const card = extractCard(el);
    expect(card?.title).toBe('Inception');
  });

  it('returns null when no id and no link', () => {
    const el = document.createElement('div');
    expect(extractCard(el)).toBeNull();
  });

  it('returns null when no title found', () => {
    const el = document.createElement('div');
    el.setAttribute('data-id', '123');
    expect(extractCard(el)).toBeNull();
  });
});

describe('findCards', () => {
  it('never returns a container that holds links to MULTIPLE different titles', () => {
    // A row-level wrapper (e.g. a rail that matched [data-ui-tracking-context]
    // or a fallback class containing "card") must NOT become the card container
    // for every tile in it — that collapsed everything onto one rating.
    document.body.innerHTML = `
      <div data-ui-tracking-context="row">
        <div class="slider-item">
          <a href="/title/80050063" aria-label="Inception (2010) - Sci-Fi Movies"></a>
        </div>
        <div class="slider-item">
          <a href="/title/70191831" aria-label="The Room (2003) - Independent Movies"></a>
        </div>
      </div>
    `;
    const found = findCards(document);
    expect(found).toHaveLength(2);
    const titles = found.map((el) => extractCard(el)?.title).sort();
    expect(titles).toEqual(['Inception', 'The Room']);
  });

  it('walks up to the tightest single-title ancestor even when container selectors miss', () => {
    document.body.innerHTML = `
      <div class="card-groups">
        <div class="slider-content">
          <div class="slider-item"><a href="/title/80050063" aria-label="Inception (2010) - Sci-Fi Movies"></a></div>
          <div class="slider-item"><a href="/title/70191831" aria-label="The Room (2003) - Independent Movies"></a></div>
        </div>
      </div>
    `;
    const found = findCards(document);
    expect(found).toHaveLength(2);
    const titles = found.map((el) => extractCard(el)?.title).sort();
    expect(titles).toEqual(['Inception', 'The Room']);
  });
});