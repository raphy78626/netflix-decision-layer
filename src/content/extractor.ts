import type { NetflixCard, NetflixTitleType } from '@/types/netflix';

// A real Netflix title card is an anchor whose href carries a numeric title ID.
// Modern Netflix browse grids use href="/browse?jbv=NNNN" (NOT /title/NNNN);
// older / detail layouts use /title/NNNN or /watch/NNNN. We anchor on all of
// these and also on the explicit data-uia card markers.
const CARD_LINK_SELECTORS = [
  'a[href*="/title/"]',
  'a[href*="/watch/"]',
  'a[href*="/browse?jbv="]',
  'a[href*="jbv="]',
  'a[data-uia="standard-card"]',
  'a[data-uia="ranked-card"]',
  'a[data-uia="progress-card"]',
];

// Fallback card-container selectors, used only when the tight single-title
// walk (see walkUpToContainer) does not resolve.
const CONTAINER_SELECTORS = [
  '.title-card',
  '[data-ui-tracking-context]',
  '[class*="title-card"]',
  '[class*="titleCard"]',
  '[data-uia*="title-card"]',
];

/** Pull the numeric title/watch/jbv ID from a link's href or data-videoid. */
export function extractNumericId(link: HTMLElement): string | undefined {
  const href = link.getAttribute('href') ?? '';
  // /title/NNNN or /watch/NNNN
  let m = href.match(/\/(?:title|watch)\/(\d+)/);
  if (m) return m[1];
  // /browse?jbv=NNNN (modern browse grid)
  m = href.match(/[?&]jbv=(\d+)/);
  if (m) return m[1];
  // data-videoid attribute on the link itself
  const vid = link.getAttribute('data-videoid');
  if (vid && /^\d+$/.test(vid)) return vid;
  return undefined;
}

/**
 * The numeric Netflix title ID that identifies this card element, if any.
 * Reads the card's own data-id, else the first title/watch link inside it.
 */
export function getCardNetflixId(card: HTMLElement): string | undefined {
  // The card <a> itself often carries the id (data-videoid, or jbv in href).
  if (card.tagName === 'A') {
    const id = extractNumericId(card);
    if (id) return id;
  }
  // data-videoid on the container
  const vid = card.getAttribute('data-videoid');
  if (vid && /^\d+$/.test(vid)) return vid;
  // data-id is numeric on older Netflix cards; on modern Netflix it's
  // non-numeric ("home", "series", …) on nav links, so only accept numeric.
  const did = card.getAttribute('data-id');
  if (did && /^\d+$/.test(did)) return did;
  return findNetflixIdFromLink(card);
}

/**
 * Find all Netflix title cards on the page.
 * Returns the card container elements we should attach overlays to.
 */
// Containers that are NEVER a title card, even though they contain a numeric
// /title/ or /watch/ link. These are hover-preview popups, the notification-bell
// dropdown, and the play-button row inside the preview popup. Processing them
// produces no badge (no title text) and spams the diagnostic dump.
const NON_CARD_ANCESTOR_SELECTORS = [
  '[data-uia*="notification"]',
  '[data-uia="mini-modal-controls"]',
  '[class*="buttonControls"]',
  '[class*="previewModal"]',
  '[class*="mini-modal"]',
];

function isInsideNonCard(link: HTMLElement): boolean {
  for (const sel of NON_CARD_ANCESTOR_SELECTORS) {
    if (link.closest<HTMLElement>(sel)) return true;
  }
  return false;
}

export function findCards(root: ParentNode = document): HTMLElement[] {
  const found = new Set<HTMLElement>();
  for (const sel of CARD_LINK_SELECTORS) {
    root.querySelectorAll<HTMLElement>(sel).forEach((link) => {
      // Only links with a NUMERIC title/watch ID count as real title cards.
      // This filters out UI buttons (Resume, Turn audio on, notifications).
      const id = extractNumericId(link);
      if (!id) return;
      // Skip hover-preview popups, the notification bell dropdown, and the
      // play-button row inside the modal — they contain title links but are
      // not browse cards.
      if (isInsideNonCard(link)) return;
      const card = walkUpToContainer(link);
      found.add(card);
    });
  }
  return Array.from(found);
}

/**
 * Walk up from a title link to the tightest ancestor that represents exactly
 * ONE title.
 *
 * A container that contains links to MULTIPLE different titles — a whole row,
 * a rail track, etc. — is never accepted as a card container. When such a
 * shared container is picked, every tile in it gets the same fingerprint (and
 * therefore the same rating from the cache/OMDb), which is exactly the
 * "the same rating shows on every tile" bug.
 */
function walkUpToContainer(el: HTMLElement): HTMLElement {
  // Walk up from the link and return the LARGEST subtree that still contains
  // exactly ONE numeric title ID — i.e. the last "good" ancestor before we
  // reach a multi-title container (a row/rail) or the walk bound.
  //
  // Why "largest" and not "tightest": on real Netflix the title link is
  // almost always wrapped in a small boxart/poster wrapper that contains only
  // that one link. The tightest single-title ancestor is therefore that
  // little wrapper, but the title text + container aria-label live one or two
  // levels higher in the real `.title-card`. Stopping at the tightest wrapper
  // made extractCard() fail to find a title on every card -> no badges at
  // all. We must instead climb to the highest single-title subtree, which is
  // the card itself.
  const WALK_LIMIT = 12;
  let node: HTMLElement | null = el.parentElement;
  let lastGood: HTMLElement | null = null;
  let levels = 0;
  while (node && levels < WALK_LIMIT) {
    const size = distinctTitleIdsIn(node).size;
    if (size > 1) break; // hit a row/rail — the previous ancestor was the card
    if (size === 1) lastGood = node;
    node = node.parentElement;
    levels++;
  }
  if (lastGood) return lastGood;

  // 2. Fall back to the known card-container selectors.
  for (const sel of CONTAINER_SELECTORS) {
    const c = el.closest<HTMLElement>(sel);
    if (c) return c;
  }

  // 3. Last-resort heuristic walk (bounded), same as before.
  node = el;
  for (let i = 0; i < 5 && node; i++) {
    const parent: HTMLElement | null = node.parentElement;
    if (!parent) break;
    if (parent.getAttribute('role') === 'listitem' || /card/i.test(parent.className)) {
      return parent;
    }
    node = parent;
  }
  return el.closest<HTMLElement>('a')?.parentElement ?? el;
}

/** Distinct numeric title/watch IDs of all title links inside `root`. */
function distinctTitleIdsIn(root: HTMLElement): Set<string> {
  const ids = new Set<string>();
  for (const sel of CARD_LINK_SELECTORS) {
    root.querySelectorAll<HTMLElement>(sel).forEach((l) => {
      const id = extractNumericId(l);
      if (id) ids.add(id);
    });
  }
  return ids;
}

/**
 * Extract title + year + type from a Netflix card.
 * Strict: requires a numeric netflix title ID (from data-id or a /title|watch/ link).
 *
 * Title sourcing order (per-card sources FIRST — never trust an arbitrary
 * shared/container attribute):
 *   1. the card's own title link (`a[href*="/title/"]` / `a[href*="/watch/"]`):
 *      its aria-label, then its contained `.fallback-text`;
 *   2. known per-title text elements anywhere in the card
 *      (`.fallback-text`, `[data-uia*="title"]`, `[class*="title-text"]`);
 *   3. last resort: the card container's own aria-label.
 *
 * The old code took the FIRST `[aria-label]` descendant of the card, which on
 * modern Netflix layouts is often generic UI chrome (e.g. a "Play" button, or
 * a "Details" label) positioned before the real title. Every card then
 * extracted the SAME generic string -> identical fingerprints -> the same
 * rating stamped on every tile.
 */
export function extractCard(card: HTMLElement): NetflixCard | null {
  const netflixId = getCardNetflixId(card);
  if (!netflixId) return null;

  let title: string | undefined;
  let year: number | undefined;
  let type: NetflixTitleType = 'unknown';

  // 1. PRIMARY: the card's own title link is always per-title.
  const titleLink = findTitleLink(card);
  if (titleLink) {
    const aria = titleLink.getAttribute('aria-label');
    if (aria) {
      const parsed = parseAriaLabel(aria);
      if (isLikelyTitleLabel(aria, parsed)) {
        title = parsed.title ?? title;
        year = parsed.year ?? year;
        if (parsed.type) type = parsed.type;
      }
    }
    if (!title) {
      const linkFallback = titleLink.querySelector('.fallback-text')?.textContent?.trim();
      if (linkFallback) title = linkFallback;
    }
  }

  // 2. Secondary: known per-title text elements anywhere in the card.
  if (!title) {
    const titleEl =
      card.querySelector<HTMLElement>('.fallback-text') ??
      card.querySelector<HTMLElement>('[data-uia*="title"]') ??
      card.querySelector<HTMLElement>('[class*="title-text"]');
    if (titleEl) title = titleEl.textContent?.trim();
  }

  // 3. Tertiary: the poster image's alt text. On several Netflix layouts the
  //    title is ONLY present as the <img alt="..."> on the poster, with no
  //    separate text node or aria-label.
  if (!title) {
    const img = card.querySelector<HTMLImageElement>('img[alt]');
    if (img) {
      const alt = img.getAttribute('alt')?.trim();
      if (alt && alt.length >= 2 && !GENERIC_ARIA_LABELS.has(alt.toLowerCase())) {
        title = alt;
      }
    }
  }

  // 4. Last resort: the container's own aria-label.
  if (!title) {
    const aria = card.getAttribute('aria-label');
    if (aria) {
      const parsed = parseAriaLabel(aria);
      if (isLikelyTitleLabel(aria, parsed)) {
        title = parsed.title ?? title;
        year = parsed.year ?? year;
        if (parsed.type) type = parsed.type;
      }
    }
  }

  if (!title) return null;

  // Skip episode cards — they don't resolve well on OMDb
  if (card.matches('[data-episode-id], .episode-item, [class*="episode"]')) return null;
  if (type === 'episode') return null;

  return { netflixId, title, year, type, element: card };
}

/** The card's own per-title link (first numeric /title|watch/ link in DOM order). */
function findTitleLink(card: HTMLElement): HTMLElement | null {
  for (const sel of CARD_LINK_SELECTORS) {
    const links = card.querySelectorAll<HTMLElement>(sel);
    for (const l of links) {
      if (extractNumericId(l)) return l;
    }
  }
  return null;
}

// aria-labels that are generic UI chrome, not a title. Modern Netflix cards
// can surface these BEFORE the real title (e.g. a "Play" button); using one as
// the title makes EVERY card extract the same string -> same fingerprint ->
// the same rating on every tile.
const GENERIC_ARIA_LABELS = new Set([
  'play',
  'details',
  'more info',
  'info',
  'rate',
  'share',
  'resume',
  'episodes',
  'episode',
  'add to my list',
  'remove from my list',
  'my list',
  'like',
  'not interested',
  'title',
  'title card',
]);

/**
 * A Netflix title aria-label almost always carries a parenthesized year and/or
 * a type marker ("... - TV Series", "... - Movie"). Reject labels without
 * either that are short or on the generic denylist, so "Play"/"Details" labels
 * never masquerade as titles.
 */
function isLikelyTitleLabel(
  aria: string,
  parsed: { title?: string; year?: number; type?: NetflixTitleType },
): boolean {
  if (parsed.year !== undefined) return true; // "(2010)" => definitely a title label
  if (parsed.type !== undefined && parsed.type !== 'unknown') return true; // "... - TV Series" => definitely
  const t = parsed.title?.trim().toLowerCase();
  if (!t) return false;
  if (GENERIC_ARIA_LABELS.has(t)) return false; // "play"/"rate"/"details"…
  // Accept any other non-empty label. Real Netflix titles can be very short
  // ("You", "GDN", "Mox", "Up"); the denylist above is what rejects chrome.
  return aria.trim().length >= 1;
}

function findNetflixIdFromLink(card: HTMLElement): string | undefined {
  for (const sel of CARD_LINK_SELECTORS) {
    const link = card.querySelector<HTMLAnchorElement>(sel);
    if (link) {
      const id = extractNumericId(link);
      if (id) return id;
    }
  }
  return undefined;
}

/**
 * Parse aria-labels like:
 *  - "Inception (2010) - 16+ - 2h 28m - Sci-Fi Movies"
 *  - "The Crown (2016) - TV Series"
 *  - "Stranger Things - Netflix Series"
 *
 * The title is everything before the parenthesized year, else before the first
 * spaced dash separator. An UNSPACED dash inside a title ("Spider-Man",
 * "Avatar: The Way of Water") must NOT truncate the title.
 */
export function parseAriaLabel(aria: string): { title?: string; year?: number; type?: NetflixTitleType } {
  const result: { title?: string; year?: number; type?: NetflixTitleType } = {};

  // Year: first 4-digit number in parentheses
  const yearMatch = aria.match(/\((\d{4})\)/);
  if (yearMatch) result.year = parseInt(yearMatch[1], 10);

  // Type detection (match singular and plural: "Movie"/"Movies", "Series", "Episode(s)")
  const lower = aria.toLowerCase();
  if (/\b(episodes?|tv episodes?)\b/.test(lower)) result.type = 'episode';
  else if (/\b(series|tv series|netflix series)\b/.test(lower)) result.type = 'series';
  else if (/\b(movies?|films?)\b/.test(lower)) result.type = 'movie';

  // Title: before the parenthesized year, or before the first spaced dash.
  const titlePart = aria.split(/\s*\(\d{4}\)|\s+(?:-|–|—)\s+/)[0]?.trim();
  if (titlePart) result.title = titlePart;

  return result;
}