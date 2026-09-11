import { resolveTitle } from './resolver';
import { getStatus } from './rate-limiter';
import { getSettings } from '@/storage/settings';

// Message protocol between content script and service worker
export type BgRequest =
  | { kind: 'resolve'; fingerprint: string; title: string; year?: number; type: 'movie' | 'series' | 'episode' | 'unknown' }
  | { kind: 'rate-limit-status' };

export type BgResponse =
  | { kind: 'resolve-ok'; status: 'cached' | 'fresh'; ratings: unknown }
  | { kind: 'resolve-notfound' }
  | { kind: 'resolve-rate-limited'; retryAfterMs?: number }
  | { kind: 'resolve-error'; message: string }
  | { kind: 'rate-limit-status'; dayCount: number; minCount: number; dayLimit: number; burstLimit: number };

chrome.runtime.onInstalled.addListener(() => {
  console.log('[NDL] service worker installed');
});

chrome.runtime.onMessage.addListener((msg: BgRequest, _sender, sendResponse) => {
  (async () => {
    if (msg.kind === 'resolve') {
      console.log('[NDL] resolve request:', msg.title, msg.year, msg.type);
      const settings = await getSettings();
      if (!settings.omdbApiKey) {
        console.log('[NDL] resolve rejected — no API key');
        const r: BgResponse = { kind: 'resolve-error', message: 'No OMDb API key set. Open extension options to add one.' };
        sendResponse(r);
        return;
      }
      const result = await resolveTitle({
        fingerprint: msg.fingerprint,
        title: msg.title,
        year: msg.year,
        type: msg.type,
        apiKey: settings.omdbApiKey,
      });
      console.log('[NDL] resolve result:', msg.title, '→', result.status);
      if (result.status === 'cached' || result.status === 'fresh') {
        sendResponse({ kind: 'resolve-ok', status: result.status, ratings: result.ratings } satisfies BgResponse);
      } else if (result.status === 'notfound') {
        sendResponse({ kind: 'resolve-notfound' } satisfies BgResponse);
      } else if (result.status === 'rate-limited') {
        sendResponse({ kind: 'resolve-rate-limited', retryAfterMs: result.retryAfterMs } satisfies BgResponse);
      } else {
        sendResponse({ kind: 'resolve-error', message: result.message } satisfies BgResponse);
      }
      return;
    }
    if (msg.kind === 'rate-limit-status') {
      const s = await getStatus();
      sendResponse({
        kind: 'rate-limit-status',
        dayCount: s.dayCount,
        minCount: s.minCount,
        dayLimit: s.dayLimit,
        burstLimit: s.burstLimit,
      } satisfies BgResponse);
      return;
    }
  })().catch((e) => {
    sendResponse({ kind: 'resolve-error', message: (e as Error).message } satisfies BgResponse);
  });
  return true; // async response
});
