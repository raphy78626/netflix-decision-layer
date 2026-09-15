// Jio Hotstar / Disney+ Hotstar platform adapter.
// Confirmed against live https://www.hotstar.com/in (Sep 2026 probe).
//
// Real Hotstar DOM:
//   - Content cards: <a data-testid="link" href="/in/<type>/<slug>/.../watch"
//     aria-label="<title>, <metadata>"> wrapping <article> with <img alt="<title>">.
//   - Nav (EXCLUDE): <a data-testid="link" role="tab" linkuntabbable="true"
//     href="/in/shows"> — category pages, no /watch.
//   - Hover dup (EXCLUDE): [data-testid="tray-horizontal-card-hover"].
//   - Ads (EXCLUDE): [data-testid="ad-media"].
// Title id = content slug from /in/<type>/<slug>/. Episode/live cards skipped.

import type { PlatformAdapter } from './platform';
import type { TitleCard, TitleType } from '@/types/title';

const CARD_LINK_SELECTORS = [
  'a[data-testid="link"][href*="/in/movies/"]',
  'a[data-testid="link"][href*="/in/shows/"]',
  'a[data-testid="link"][href*="/in/series/"]',
];

const CONTAINER_SELECTORS = ['[data-testid="action"][class*="w-full"]', 'article', '[class*="card"]', '[role="listitem"]'];

const NON_CARD_ANCESTOR_SELECTORS = [
  '[role="tab"]', '[linkuntabbable="true"]', '[linkrole="tab"]',
  '[data-testid="tray-horizontal-card-hover"]', '[data-testid="ad-media"]',
  'nav', '[class*="navbar"]', '[class*="header"]',
];

const GENERIC_ARIA_LABELS = new Set([
  'play', 'watch', 'watch now', 'more info', 'info', 'details', 'share',
  'add to watchlist', 'remove from watchlist', 'watchlist', 'like', 'trailer',
  'home', 'search', 'tv', 'movies', 'sports', 'categories', 'my space',
]);

function extractHotstarId(link: HTMLElement): string | undefined {
  const href = link.getAttribute('href') ?? '';
  const m = href.match(/\/in\/(?:movies|shows|series|sports)\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : undefined;
}

function isInsideNonCard(link: HTMLElement): boolean {
  if (link.getAttribute('role') === 'tab') return true;
  for (const sel of NON_CARD_ANCESTOR_SELECTORS) {
    if (link.closest<HTMLElement>(sel)) return true;
  }
  return false;
}

function distinctTitleIdsIn(root: HTMLElement): Set<string> {
  const ids = new Set<string>();
  for (const sel of CARD_LINK_SELECTORS) {
    root.querySelectorAll<HTMLElement>(sel).forEach((l) => {
      if (isInsideNonCard(l)) return;
      const id = extractHotstarId(l);
      if (id) ids.add(id);
    });
  }
  return ids;
}

function walkUpToContainer(el: HTMLElement): HTMLElement {
  const WALK_LIMIT = 12;
  let node: HTMLElement | null = el.parentElement;
  let lastGood: HTMLElement | null = null;
  let levels = 0;
  while (node && levels < WALK_LIMIT) {
    const size = distinctTitleIdsIn(node).size;
    if (size > 1) break;
    if (size === 1) lastGood = node;
    node = node.parentElement;
    levels++;
  }
  if (lastGood) return lastGood;
  for (const sel of CONTAINER_SELECTORS) {
    const c = el.closest<HTMLElement>(sel);
    if (c) return c;
  }
  return el.parentElement ?? el;
}

function findTitleLink(card: HTMLElement): HTMLElement | null {
  for (const sel of CARD_LINK_SELECTORS) {
    const links = card.querySelectorAll<HTMLElement>(sel);
    for (const l of links) {
      if (isInsideNonCard(l)) continue;
      if (extractHotstarId(l)) return l;
    }
  }
  return null;
}

function findHotstarIdFromLink(card: HTMLElement): string | undefined {
  for (const sel of CARD_LINK_SELECTORS) {
    const link = card.querySelector<HTMLAnchorElement>(sel);
    if (link && !isInsideNonCard(link)) {
      const id = extractHotstarId(link);
      if (id) return id;
    }
  }
  return undefined;
}

function parseLabel(label: string): { title?: string; year?: number; type?: TitleType } {
  const result: { title?: string; year?: number; type?: TitleType } = {};
  const yearMatch = label.match(/\((\d{4})\)/);
  if (yearMatch) result.year = parseInt(yearMatch[1], 10);
  const lower = label.toLowerCase();
  if (/\b(episode|clip|teaser)\b/.test(lower)) result.type = 'episode';
  else if (/\b(series|show|season)\b/.test(lower)) result.type = 'series';
  else if (/\b(movie|film)\b/.test(lower)) result.type = 'movie';
  const commaIdx = label.indexOf(', ');
  if (commaIdx !== -1) {
    const after = label.slice(commaIdx + 2).toLowerCase();
    if (/^(clip|episode|teaser|live|movie|film|series|season|\d+\s*(hours?|hrs?|minutes?|mins?))/.test(after)) {
      result.title = label.slice(0, commaIdx).trim();
      return result;
    }
  }
  result.title = label.split(/\s*\(\d{4}\)/)[0]?.trim();
  return result;
}

function isLikelyTitleLabel(label: string, parsed: { title?: string }): boolean {
  const t = parsed.title?.trim().toLowerCase();
  if (!t) return false;
  if (GENERIC_ARIA_LABELS.has(t)) return false;
  return label.trim().length >= 1;
}

function getCardId(card: HTMLElement): string | undefined {
  if (card.tagName === 'A') {
    const id = extractHotstarId(card);
    if (id) return id;
  }
  return findHotstarIdFromLink(card);
}

export const hotstarAdapter: PlatformAdapter = {
  id: 'hotstar',
  name: 'Jio Hotstar',

  matchesHost(host: string): boolean {
    return /(^|\.)(hotstar|jiocinema)\.com$/.test(host);
  },

  getCardId,

  findCards(root: ParentNode = document): HTMLElement[] {
    const found = new Set<HTMLElement>();
    for (const sel of CARD_LINK_SELECTORS) {
      root.querySelectorAll<HTMLElement>(sel).forEach((link) => {
        if (!extractHotstarId(link)) return;
        if (isInsideNonCard(link)) return;
        found.add(walkUpToContainer(link));
      });
    }
    return Array.from(found);
  },

  extractCard(card: HTMLElement): TitleCard | null {
    const id = getCardId(card);
    if (!id) return null;

    let title: string | undefined;
    let year: number | undefined;
    let type: TitleType = 'unknown';

    const titleLink = findTitleLink(card);
    if (titleLink) {
      // Prefer the poster image alt — it's the cleanest title source on Hotstar.
      const img = titleLink.querySelector<HTMLImageElement>('img[alt]');
      if (img) {
        const alt = img.getAttribute('alt')?.trim();
        if (alt && alt.length >= 2 && !GENERIC_ARIA_LABELS.has(alt.toLowerCase())) {
          title = alt;
        }
      }
      if (!title) {
        const aria = titleLink.getAttribute('aria-label') ?? titleLink.getAttribute('title');
        if (aria) {
          const parsed = parseLabel(aria);
          if (isLikelyTitleLabel(aria, parsed)) {
            title = parsed.title;
            year = parsed.year;
            if (parsed.type) type = parsed.type;
          }
        }
      }
    }

    if (!title) {
      const img = card.querySelector<HTMLImageElement>('img[alt]');
      if (img) {
        const alt = img.getAttribute('alt')?.trim();
        if (alt && alt.length >= 2 && !GENERIC_ARIA_LABELS.has(alt.toLowerCase())) title = alt;
      }
    }

    if (!title) return null;

    // Skip episode / live-stream cards (they don't resolve cleanly on OMDb).
    const href = titleLink?.getAttribute('href') ?? '';
    if (/\/live\//.test(href)) return null;
    if (type === 'episode') return null;
    // Episode href pattern: /in/shows/<slug>/<show-id>/<ep-slug>/<ep-id>/watch
    if (/\/\d+\/[^/]+\/\d+\/watch/.test(href)) return null;

    // Infer type from the href path if not already set.
    if (type === 'unknown') {
      if (/\/in\/(shows|series)\//.test(href)) type = 'series';
      else if (/\/in\/movies\//.test(href)) type = 'movie';
    }

    return { platform: 'hotstar', id, title, year, type, element: card };
  },
};
