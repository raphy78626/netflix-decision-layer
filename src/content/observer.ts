import { extractCard, findCards, getCardId } from './extractor';
import { fingerprint } from '@/utils/fingerprint';
import { discardCardShadow } from './shadow-host';
import type { TitleCard } from '@/types/title';

export interface ScanResult {
  cards: TitleCard[];
}

const DEBOUNCE_MS = 200;
const NDL_ATTR = 'data-ndl-seen';
const NDL_ID_ATTR = 'data-ndl-id';

let scanTimer: ReturnType<typeof setTimeout> | null = null;
let observer: MutationObserver | null = null;

type CardHandler = (card: TitleCard, fp: string) => void;
let handler: CardHandler | null = null;

export function startObserver(cb: CardHandler): void {
  handler = cb;
  if (observer) return;

  // Initial scan
  scheduleScan();

  observer = new MutationObserver(() => scheduleScan());
  observer.observe(document.body, { childList: true, subtree: true });

  // Re-scan on SPA route changes
  patchHistoryApi();
  window.addEventListener('popstate', () => scheduleScan());
}

export function stopObserver(): void {
  observer?.disconnect();
  observer = null;
  if (scanTimer) clearTimeout(scanTimer);
}

function scheduleScan(): void {
  if (scanTimer) clearTimeout(scanTimer);
  scanTimer = setTimeout(scan, DEBOUNCE_MS);
}

export function scan(): void {
  if (!handler) return;
  const elements = findCards(document);
  if (elements.length > 0) {
    console.log('[NDL] scan: found', elements.length, 'candidate card(s)');
  }
  let extracted = 0;
  const failedSamples: HTMLElement[] = [];
  for (const el of elements) {
    const currentId = getCardId(el);
    const stampedId = el.getAttribute(NDL_ID_ATTR);
    // Skip only when we already processed THIS element for THIS title.
    // Netflix reuses DOM nodes when rows re-render: if a wrapper now points
    // at a DIFFERENT title, the old badge is stale — drop it and reprocess.
    if (currentId !== undefined && stampedId === currentId) continue;
    if (stampedId && stampedId !== currentId) {
      discardCardShadow(el);
    }

    const card = extractCard(el);
    if (!card) {
      if (failedSamples.length < 3) failedSamples.push(el);
      continue;
    }
    extracted++;
    el.setAttribute(NDL_ATTR, '1');
    el.setAttribute(NDL_ID_ATTR, card.id);
    const fp = fingerprint(card.platform, card.id, card.title, card.year, card.type);
    handler(card, fp);
  }
  if (elements.length > 0 && extracted === 0) {
    console.log('[NDL] scan: found', elements.length, 'candidate(s) but extractor returned no valid cards — selectors may need tuning');
    console.log('[NDL] === DUMPING first candidate card HTML for diagnosis ===');
    for (let i = 0; i < failedSamples.length; i++) {
      const el = failedSamples[i];
      console.log(`[NDL] --- candidate ${i + 1} ---`);
      console.log('[NDL] tag:', el.tagName, 'attrs:', attrsObject(el));
      console.log('[NDL] outerHTML (truncated):', el.outerHTML.slice(0, 800));
    }
    console.log('[NDL] === end dump — paste this back so the extractor can be tuned ===');
  }
}

function attrsObject(el: HTMLElement): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of Array.from(el.attributes)) {
    out[a.name] = a.value.length > 80 ? a.value.slice(0, 80) + '…' : a.value;
  }
  return out;
}

let historyPatched = false;
function patchHistoryApi(): void {
  if (historyPatched) return;
  historyPatched = true;
  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);
  history.pushState = (...args: Parameters<typeof history.pushState>) => {
    origPush(...args);
    scheduleScan();
  };
  history.replaceState = (...args: Parameters<typeof history.replaceState>) => {
    origReplace(...args);
    scheduleScan();
  };
}