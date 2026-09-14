// Jio Hotstar / Disney+ Hotstar platform adapter.
//
// ⚠ UNCONFIRMED — selectors below are best-guess scaffolds based on typical
// Hotstar/JioCinema React DOM. They MUST be confirmed against the real site
// with `npm run probe:hotstar` (headed Chromium) before relying on them.
// Tune CARD_LINK_SELECTORS / title sources from the probe dump, exactly as
// was done for Netflix.
//
// Hosts: www.hotstar.com, www.jiocinema.com (JioCinema is the successor in IN).
// Hotstar title URLs use a content slug, e.g. /movies/<slug> or /tv/<slug>.
// The slug is unique per title, so it serves as the stable card id.

import type { PlatformAdapter } from './platform';
import type { TitleCard, TitleType } from '@/types/title';

// Best-guess card link selectors. Hotstar cards are typically <a> anchors
// pointing at /movies/…, /tv/…, /show/…, /sports/… . Tune after probing.
const CARD_LINK_SELECTORS = [
  'a[href*="/movies/"]',
  'a[href*="/tv/"]',
  'a[href*="/show/"]',
  'a[href*="/series/"]',
];

// Card-container selectors (fallback for walkUpToContainer).
const CONTAINER_SELECTORS = [
  '[class*="card"]',
  '[data-testid*="card"]',
  '[class*="tile"]',
  '[role="listitem"]',
];

// Containers that are never a card (nav, hero, search suggestions).
const NON_CARD_ANCESTOR_SELECTORS = [
  'nav',
  '[class*="navbar"]',
  '[class*="header"]',
  '[class*="hero"]',
  '[class*="search"]',
  '[role="search"]',
];

const GENERIC_ARIA_LABELS = new Set([
  'play', 'watch', 'more info', 'info', 'details', 'share', 'add to watchlist',
  'remove from watchlist', 'watchlist', 'like', 'trailer',
]);

/** Extract the content slug/id from a Hotstar card link's href. */
function extractHotstarId(link: HTMLElement): string | undefined {
  const href = link.getAttribute('href') ?? '';
  // /movies/<slug> or /tv/<slug>/<id> — take the meaningful last path segment.
  const m = href.match(/\/(?:movies|tv|show|series)\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : undefined;
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
      if (extractHotstarId(l)) return l;
    }
  }
  return null;
}

function findHotstarIdFromLink(card: HTMLElement): string | undefined {
  for (const sel of CARD_LINK_SELECTORS) {
    const link = card.querySelector<HTMLAnchorElement>(sel);
    if (link) {
      const id = extractHotstarId(link);
      if (id) return id;
    }
  }
  return undefined;
}

/** Parse a Hotstar aria-label/title for a bare title (Hotstar labels are
 *  usually just the title, sometimes "Title (Year)"). */
function parseLabel(label: string): { title?: string; year?: number; type?: TitleType } {
  const result: { title?: string; year?: number; type?: TitleType } = {};
  const yearMatch = label.match(/\((\d{4})\)/);
  if (yearMatch) result.year = parseInt(yearMatch[1], 10);
  const titlePart = label.split(/\s*\(\d{4}\)/)[0]?.trim();
  if (titlePart) result.title = titlePart;
  return result;
}

function isLikelyTitleLabel(label: string, parsed: { title?: string }): boolean {
  const t = parsed.title?.trim().toLowerCase();
  if (!t) return false;
  if (GENERIC_ARIA_LABELS.has(t)) return false;
  return label.trim().length >= 1;
}

/** The Hotstar content slug/id that identifies this card element, if any. */
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
      const aria = titleLink.getAttribute('aria-label') ?? titleLink.getAttribute('title');
      if (aria) {
        const parsed = parseLabel(aria);
        if (isLikelyTitleLabel(aria, parsed)) {
          title = parsed.title;
          year = parsed.year;
        }
      }
    }

    if (!title) {
      const titleEl =
        card.querySelector<HTMLElement>('[class*="title"]') ??
        card.querySelector<HTMLElement>('[data-testid*="title"]');
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
        }
      }
    }

    if (!title) return null;
    // Infer type from the href path.
    if (/\/(tv|series|show)\//.test(titleLink?.getAttribute('href') ?? '')) type = 'series';
    else if (/\/movies?\//.test(titleLink?.getAttribute('href') ?? '')) type = 'movie';

    return { platform: 'hotstar', id, title, year, type, element: card };
  },
};
