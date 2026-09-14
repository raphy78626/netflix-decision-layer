// Amazon Prime Video platform adapter.
//
// ⚠ UNCONFIRMED — selectors below are best-guess scaffolds based on typical
// Prime Video DOM. They MUST be confirmed against the real site with
// `npm run probe:prime` (headed Chromium) before relying on them. Tune
// CARD_LINK_SELECTORS / title sources from the probe dump.
//
// Host: www.primevideo.com (also amazon.com/gp/video in some regions).
// Prime Video title URLs use an Amazon Title Video (ATV) id, e.g.
// /detail/<amzn1.dv.gti...>/ . The id is unique per title.

import type { PlatformAdapter } from './platform';
import type { TitleCard, TitleType } from '@/types/title';

// Best-guess card link selectors. Prime Video cards link to /detail/<id>,
// /region/eu/detail/<id>, etc. Tune after probing.
const CARD_LINK_SELECTORS = [
  'a[href*="/detail/"]',
  'a[href*="/gp/video/"]',
  'a[data-testid*="card"]',
  'a[data-testid*="title"]',
];

const CONTAINER_SELECTORS = [
  '[data-testid*="card"]',
  '[class*="card"]',
  '[class*="tile"]',
  '[role="listitem"]',
];

const NON_CARD_ANCESTOR_SELECTORS = [
  'nav',
  '[class*="nav"]',
  '[class*="header"]',
  '[class*="hero"]',
  '[class*="search"]',
  '[role="search"]',
];

const GENERIC_ARIA_LABELS = new Set([
  'play', 'watch now', 'more info', 'info', 'details', 'share',
  'add to watchlist', 'remove from watchlist', 'watchlist', 'trailer',
]);

/** Extract the ATV title id from a Prime Video card link's href. */
function extractPrimeId(link: HTMLElement): string | undefined {
  const href = link.getAttribute('href') ?? '';
  // /detail/<id> or /region/<r>/detail/<id>
  let m = href.match(/\/detail\/([^/?#]+)/);
  if (m) return decodeURIComponent(m[1]);
  // /gp/video/detail/<id>/
  m = href.match(/\/gp\/video\/detail\/([^/?#]+)/);
  if (m) return decodeURIComponent(m[1]);
  // data-title-id attribute
  const tid = link.getAttribute('data-title-id');
  if (tid) return tid;
  return undefined;
}

function isInsideNonCard(link: HTMLElement): boolean {
  for (const sel of NON_CARD_ANCESTOR_SELECTORS) {
    if (link.closest<HTMLElement>(sel)) return true;
  }
  return false;
}

function distinctTitleIdsIn(root: HTMLElement): Set<string> {
  const ids = new Set<string>();
  for (const sel of CARD_LINK_SELECTORS) {
    root.querySelectorAll<HTMLElement>(sel).forEach((l) => {
      const id = extractPrimeId(l);
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
      if (extractPrimeId(l)) return l;
    }
  }
  return null;
}

function findPrimeIdFromLink(card: HTMLElement): string | undefined {
  for (const sel of CARD_LINK_SELECTORS) {
    const link = card.querySelector<HTMLAnchorElement>(sel);
    if (link) {
      const id = extractPrimeId(link);
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
  if (/\b(tv series|series|season)\b/.test(lower)) result.type = 'series';
  else if (/\b(movie|film)\b/.test(lower)) result.type = 'movie';
  const titlePart = label.split(/\s*\(\d{4}\)|\s+(?:-|–|—)\s+/)[0]?.trim();
  if (titlePart) result.title = titlePart;
  return result;
}

function isLikelyTitleLabel(label: string, parsed: { title?: string }): boolean {
  const t = parsed.title?.trim().toLowerCase();
  if (!t) return false;
  if (GENERIC_ARIA_LABELS.has(t)) return false;
  return label.trim().length >= 1;
}

/** The Amazon ATV title id that identifies this card element, if any. */
function getCardId(card: HTMLElement): string | undefined {
  if (card.tagName === 'A') {
    const id = extractPrimeId(card);
    if (id) return id;
  }
  return findPrimeIdFromLink(card);
}

export const primevideoAdapter: PlatformAdapter = {
  id: 'primevideo',
  name: 'Amazon Prime Video',

  matchesHost(host: string): boolean {
    return /(^|\.)(primevideo|amazon)\.com$/.test(host);
  },

  getCardId,

  findCards(root: ParentNode = document): HTMLElement[] {
    const found = new Set<HTMLElement>();
    for (const sel of CARD_LINK_SELECTORS) {
      root.querySelectorAll<HTMLElement>(sel).forEach((link) => {
        if (!extractPrimeId(link)) return;
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

    if (!title) {
      const titleEl =
        card.querySelector<HTMLElement>('[data-testid*="title"]') ??
        card.querySelector<HTMLElement>('[class*="title"]');
      if (titleEl) title = titleEl.textContent?.trim();
    }

    if (!title) {
      const img = card.querySelector<HTMLImageElement>('img[alt]');
      if (img) {
        const alt = img.getAttribute('alt')?.trim();
        if (alt && alt.length >= 2 && !GENERIC_ARIA_LABELS.has(alt.toLowerCase())) {
          title = alt;
        }
      }
    }

    if (!title) {
      const aria = card.getAttribute('aria-label');
      if (aria) {
        const parsed = parseLabel(aria);
        if (isLikelyTitleLabel(aria, parsed)) {
          title = parsed.title;
          year = parsed.year;
          if (parsed.type) type = parsed.type;
        }
      }
    }

    if (!title) return null;
    return { platform: 'primevideo', id, title, year, type, element: card };
  },
};
