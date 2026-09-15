// Amazon Prime Video platform adapter.
// Confirmed against live https://www.primevideo.com/ (Sep 2026 probe).
//
// Real DOM: card anchors are <a href="/detail/<ATV-id>?...">. A hero title
// exposes up to 3 anchors with the SAME href (hero bg, title-art logo, and
// "More details" CTA) — we dedupe by id so they collapse to ONE card.
// Title: aria-label is clean; img alt is unreliable ("Desktop Home FBs").

import type { PlatformAdapter } from './platform';
import type { TitleCard, TitleType } from '@/types/title';

const CARD_LINK_SELECTORS = ['a[href*="/detail/"]'];

const CONTAINER_SELECTORS = ['[data-testid="title-art"]', '[class*="vMn1Fp"]', 'article', '[role="listitem"]', 'li'];

const NON_CARD_ANCESTOR_SELECTORS = [
  '[data-testid="details-cta"]', '[data-testid="action-box"]',
  'nav', '[class*="nav"]', '[class*="header"]',
];

const GENERIC_ARIA_LABELS = new Set([
  'play', 'watch now', 'more info', 'info', 'details', 'share',
  'add to watchlist', 'remove from watchlist', 'watchlist', 'trailer',
  'home', 'movies', 'tv shows', 'live tv', 'categories', 'sign in',
]);

const GENERIC_IMG_ALTS = new Set(['desktop home fbs', 'desktop home fb', 'hero', 'logo', '']);

function extractPrimeId(link: HTMLElement): string | undefined {
  const href = link.getAttribute('href') ?? '';
  const m = href.match(/\/detail\/([^/?#]+)/);
  if (m) return decodeURIComponent(m[1]);
  const tid = link.getAttribute('data-title-id');
  return tid ?? undefined;
}

function isInsideNonCard(link: HTMLElement): boolean {
  const testid = link.getAttribute('data-testid') ?? '';
  if (testid.startsWith('pv-nav-')) return true;
  if (testid === 'details-cta') return true;
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
      if (isInsideNonCard(l)) continue;
      if (extractPrimeId(l)) return l;
    }
  }
  return null;
}

function findPrimeIdFromLink(card: HTMLElement): string | undefined {
  for (const sel of CARD_LINK_SELECTORS) {
    const links = card.querySelectorAll<HTMLElement>(sel);
    for (const l of links) {
      if (isInsideNonCard(l)) continue;
      const id = extractPrimeId(l);
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
  let titlePart = label.split(/\s*\(\d{4}\)|\s+(?:-|–|—)\s+/)[0]?.trim();
  if (titlePart) titlePart = titlePart.replace(/^more details for\s+/i, '');
  if (titlePart) result.title = titlePart;
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
    // Collect one container per unique id, so a hero title's 3 anchors
    // (bg / title-art / details-cta) collapse to a single card.
    const byId = new Map<string, HTMLElement>();
    for (const sel of CARD_LINK_SELECTORS) {
      root.querySelectorAll<HTMLElement>(sel).forEach((link) => {
        if (isInsideNonCard(link)) return;
        const id = extractPrimeId(link);
        if (!id) return;
        if (byId.has(id)) return;
        byId.set(id, walkUpToContainer(link));
      });
    }
    return Array.from(byId.values());
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

    // Fallback: container's aria-label (the title-art <h2> carries it).
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

    // Last resort: img alt, but only if it's not generic chrome.
    if (!title) {
      const img = card.querySelector<HTMLImageElement>('img[alt]');
      if (img) {
        const alt = img.getAttribute('alt')?.trim();
        if (alt && alt.length >= 2 && !GENERIC_IMG_ALTS.has(alt.toLowerCase())) title = alt;
      }
    }

    if (!title) return null;
    return { platform: 'primevideo', id, title, year, type, element: card };
  },
};
