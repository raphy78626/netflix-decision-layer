import { startObserver } from './observer';
import { activePlatformId } from './extractor';
import { attachCardShadow } from './shadow-host';
import { injectBadges, injectNotFound } from './overlay';
import { showHover, hideHover } from './hover-card';
import { applyFilterToCard, evaluateFilter } from './filter';
import { getSettings, onSettingsChanged, type Settings } from '@/storage/settings';
import { computeMatch, recordSignal } from '@/storage/preferences';
import { shouldRecordHover, type Signal } from '@/storage/signals';
import type { BgRequest, BgResponse } from '@/background/service-worker';
import type { TitleCard, TitleType } from '@/types/title';
import type { TitleRatings } from '@/types/omdb';

let settings: Settings | null = null;

const LOG_PREFIX = '[NDL]';
function log(...args: unknown[]): void {
  console.log(LOG_PREFIX, ...args);
}

async function init(): Promise<void> {
  const platform = activePlatformId();
  if (!platform) {
    // Content script is matched on broad host patterns (e.g. *.amazon.com);
    // silently no-op on pages that aren't a supported streaming catalog.
    log('no supported platform for host', location.hostname, '— content script idle');
    return;
  }
  log('content script init on', location.href, '(', platform, ')');
  try {
    settings = await getSettings();
    log('settings loaded:', {
      overlay: settings.overlayEnabled,
      filter: settings.filterEnabled,
      personalization: settings.personalizationEnabled,
      hasApiKey: Boolean(settings.omdbApiKey),
    });
    if (!settings.omdbApiKey) {
      log('WARNING: no OMDb API key set — open extension options to add one. No ratings will load.');
    }
  } catch (e) {
    log('ERROR loading settings:', e);
  }
  onSettingsChanged((s) => {
    settings = s;
    log('settings changed:', { overlay: s.overlayEnabled, filter: s.filterEnabled });
    document.querySelectorAll<HTMLElement>('[data-ndl-seen]').forEach((el) => {
      const r = getCardRatings(el);
      const decision = evaluateFilter(r, s);
      applyFilterToCard(el, decision);
    });
  });

  startObserver(async (card, fingerprint) => {
    await handleCard(card, fingerprint);
  });
}

const cardRatings = new WeakMap<HTMLElement, TitleRatings | null>();

function setCardRatings(el: HTMLElement, r: TitleRatings | null): void {
  cardRatings.set(el, r);
}
function getCardRatings(el: HTMLElement): TitleRatings | null {
  return cardRatings.get(el) ?? null;
}

// Track resolved IMDb IDs to detect the "same rating on every tile" bug.
// With per-card fingerprints (netflixId embedded), two cards can only share an
// imdbId when they share a fingerprint (same title — legitimate). A warning is
// only meaningful when DIFFERENT titles collapse onto the SAME imdbId: that
// means OMDb resolution mapped distinct titles together and tiles for
// different movies show the same rating.
const resolvedImdbIds = new Map<string, Set<string>>(); // imdbId -> {title(s)}

async function handleCard(card: TitleCard, fingerprint: string): Promise<void> {
  log('card found:', { platform: card.platform, title: card.title, year: card.year, type: card.type, id: card.id, fp: fingerprint });
  if (settings) {
    const decision = evaluateFilter(null, settings);
    applyFilterToCard(card.element, decision);
  }

  wireHover(card);

  const req: BgRequest = {
    kind: 'resolve',
    fingerprint,
    title: card.title,
    year: card.year,
    type: card.type as TitleType,
  };
  chrome.runtime.sendMessage(req, (res: BgResponse) => {
    if (chrome.runtime.lastError) {
      log('sendMessage error:', chrome.runtime.lastError.message);
    }
    onResolveResponse(card, res);
  });
}

function onResolveResponse(card: TitleCard, res: BgResponse): void {
  if (!res) {
    log('no response from background for', card.title);
    return;
  }
  if (res.kind === 'resolve-ok') {
    const ratings = res.ratings as TitleRatings;
    log('ratings OK:', card.title, '→ imdbId', ratings.imdbId, 'IMDb', ratings.imdbRating, 'RT', ratings.rtCritics, 'Meta', ratings.metacritic);
    // Duplicate detection: same imdbId from DIFFERENT titles = collapse warning.
    const titles = resolvedImdbIds.get(ratings.imdbId) ?? new Set<string>();
    if (!titles.has(card.title)) {
      titles.add(card.title);
      resolvedImdbIds.set(ratings.imdbId, titles);
      if (titles.size > 1) {
        log('WARNING: same imdbId', ratings.imdbId, 'resolved for different titles —', Array.from(titles));
      }
    }
    setCardRatings(card.element, ratings);
    void renderBadges(card, ratings);
    applyCurrentFilter(card);
  } else if (res.kind === 'resolve-notfound') {
    log('not found:', card.title);
    setCardRatings(card.element, null);
    const shadow = attachCardShadow(card.element);
    injectNotFound(shadow);
  } else if (res.kind === 'resolve-error') {
    log('resolve error:', card.title, '—', (res as { message?: string }).message);
    setCardRatings(card.element, null);
    const shadow = attachCardShadow(card.element);
    injectNotFound(shadow);
  } else if (res.kind === 'resolve-rate-limited') {
    log('rate limited:', card.title);
    setCardRatings(card.element, null);
  }
}

async function renderBadges(card: TitleCard, ratings: TitleRatings): Promise<void> {
  const shadow = attachCardShadow(card.element);
  let matchPercent: number | undefined;
  let warming = false;
  if (settings?.personalizationEnabled) {
    const m = await computeMatch(ratings);
    matchPercent = m.matchPercent;
    warming = m.warming;
  }
  injectBadges(shadow, { ratings, matchPercent, personalizationWarming: warming });
}

function applyCurrentFilter(card: TitleCard): void {
  if (!settings) return;
  const r = getCardRatings(card.element);
  const decision = evaluateFilter(r, settings);
  applyFilterToCard(card.element, decision);
}

function wireHover(card: TitleCard): void {
  // A card element can be reprocessed when Netflix reuses the DOM node for a
  // different title; never stack duplicate listeners (they would double-record
  // hover signals and double-show the hover card).
  if (card.element.dataset.ndlWired === '1') return;
  card.element.dataset.ndlWired = '1';

  let hoverStart = 0;
  let hoverRecorded = false;
  card.element.addEventListener('mouseenter', (e) => {
    hoverStart = Date.now();
    hoverRecorded = false;
    const r = getCardRatings(card.element);
    if (!r) return;
    const shadow = attachCardShadow(card.element);
    showHover(shadow, { ratings: r }, e.clientX, e.clientY);
  });
  card.element.addEventListener('mousemove', (e) => {
    const r = getCardRatings(card.element);
    if (!r) return;
    const shadow = attachCardShadow(card.element);
    showHover(shadow, { ratings: r }, e.clientX, e.clientY);
  });
  card.element.addEventListener('mouseleave', () => {
    const shadow = attachCardShadow(card.element);
    hideHover(shadow);
    if (!hoverRecorded && shouldRecordHover(Date.now() - hoverStart)) {
      hoverRecorded = true;
      const r = getCardRatings(card.element);
      if (r && settings?.personalizationEnabled) {
        const signal: Signal = {
          kind: 'hover',
          imdbId: r.imdbId,
          title: r.title,
          genres: r.genres,
          year: r.year,
          runtimeMinutes: r.runtimeMinutes,
          type: r.type,
          at: Date.now(),
        };
        void recordSignal(signal);
      }
    }
  });
  card.element.addEventListener('click', () => {
    const r = getCardRatings(card.element);
    if (r && settings?.personalizationEnabled) {
      const signal: Signal = {
        kind: 'click',
        imdbId: r.imdbId,
        title: r.title,
        genres: r.genres,
        year: r.year,
        runtimeMinutes: r.runtimeMinutes,
        type: r.type,
        at: Date.now(),
      };
      void recordSignal(signal);
    }
  });
}

void init();
