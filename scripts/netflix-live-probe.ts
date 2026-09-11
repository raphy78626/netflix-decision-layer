// Live Netflix probe WITH the built extension loaded.
//
// Opens a persistent Chromium with dist/ loaded as an unpacked extension,
// navigates to netflix.com, and waits for you to be on a browse page with
// title cards visible. Then it dumps:
//   - every [NDL] console line the content script emitted
//   - every numeric /title/ or /watch/ link found on the page, with the
//     outerHTML of its walked-up container, so we can see the REAL row-card
//     shape and tune the extractor selectors.
//
// Usage:
//   npm run build
//   npx tsx scripts/netflix-live-probe.ts
//
// First run: log into Netflix in the opened window when prompted. The
// persistent profile keeps you logged in for later runs.

import { chromium } from '@playwright/test';
import { mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PROFILE_DIR = join(process.cwd(), '.playwright-profile');
const DIST_DIR = resolve(process.cwd(), 'dist');
const POLL_TIMEOUT_MS = Number(process.env.POLL_MS ?? 240_000);

async function main(): Promise<void> {
  if (!existsSync(join(DIST_DIR, 'manifest.json'))) {
    console.error('dist/manifest.json not found — run `npm run build` first.');
    process.exit(1);
  }
  mkdirSync(PROFILE_DIR, { recursive: true });

  const ndlLogs: string[] = [];
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    args: [
      `--disable-extensions-except=${DIST_DIR}`,
      `--load-extension=${DIST_DIR}`,
      '--no-default-browser-check',
    ],
  });
  const page = context.pages()[0] ?? (await context.newPage());
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[NDL]')) {
      ndlLogs.push(text);
      console.log('[page]', text);
    }
  });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));

  console.log('Navigating to netflix.com…');
  await page.goto('https://www.netflix.com/browse', { waitUntil: 'domcontentloaded' });

  console.log(`\nA Chromium window opened with the NDL extension loaded.`);
  console.log(`If you're not logged in, LOG IN NOW, then make sure you're on a browse`);
  console.log(`page where rows of title posters are visible. The probe will auto-detect`);
  console.log(`cards and dump them. (Timeout: ${POLL_TIMEOUT_MS / 1000}s)\n`);

  // Poll until we're on /browse (or a title-listing page) AND numeric links exist.
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let ready = false;
  while (Date.now() < deadline) {
    await page.waitForTimeout(4000);
    const state = await page.evaluate(() => ({
      url: location.href,
      numericLinks: document.querySelectorAll('a[href*="/title/"], a[href*="/watch/"]').length,
    }));
    const onBrowse = /netflix\.com\/(browse|title|search|genre|latest|my-list)/.test(state.url);
    if (onBrowse && state.numericLinks > 0) {
      console.log(`[probe] cards detected at ${state.url} (${state.numericLinks} numeric links)`);
      ready = true;
      break;
    }
    console.log(`[probe] waiting… url=${state.url.slice(0, 60)} numericLinks=${state.numericLinks}`);
  }
  if (!ready) {
    console.log(`[probe] no browse cards detected within ${POLL_TIMEOUT_MS / 1000}s — dumping current page state anyway.`);
  }

  const report = await page.evaluate(() => {
    const NON_CARD = [
      '[data-uia*="notification"]',
      '[data-uia="mini-modal-controls"]',
      '[class*="buttonControls"]',
      '[class*="previewModal"]',
      '[class*="mini-modal"]',
    ];
    const links = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[href*="/title/"], a[href*="/watch/"]'),
    );
    const seen = new Set<string>();
    const items: unknown[] = [];
    for (const link of links) {
      const href = link.getAttribute('href') ?? '';
      const m = href.match(/\/(?:title|watch)\/(\d+)/);
      if (!m) continue;
      const id = m[1];
      // walk up to a card-like container (mirror of extractor's container selectors)
      let container: HTMLElement = link;
      const walkSels = ['.title-card', '[data-id]', '[data-ui-tracking-context]', '[class*="title-card"]', '[class*="titleCard"]', '[data-uia*="title-card"]'];
      for (const s of walkSels) {
        const c = link.closest<HTMLElement>(s);
        if (c) { container = c; break; }
      }
      if (!container.parentElement) container = link.parentElement ?? link;
      const key = container.outerHTML.slice(0, 60) + id;
      if (seen.has(key)) continue;
      seen.add(key);
      const filteredBy = NON_CARD.filter((s) => link.closest(s));
      items.push({
        netflixId: id,
        href,
        filteredByNonCard: filteredBy.length > 0,
        filteredBy,
        containerTag: container.tagName,
        containerClass: container.className?.slice(0, 120),
        containerDataUia: container.getAttribute('data-uia'),
        containerDataId: container.getAttribute('data-id'),
        containerAriaLabel: container.getAttribute('aria-label')?.slice(0, 120),
        linkAriaLabel: link.getAttribute('aria-label'),
        imgAlt: container.querySelector('img[alt]')?.getAttribute('alt')?.slice(0, 120),
        fallbackText: container.querySelector('.fallback-text')?.textContent?.trim(),
        containerOuterHTML: container.outerHTML.slice(0, 600),
      });
    }
    return {
      url: location.href,
      title: document.title,
      totalNumericLinks: items.length,
      items: items.slice(0, 12),
    };
  });

  console.log('\n=== LIVE NETFLIX PROBE RESULTS ===');
  console.log('URL:', report.url);
  console.log('Title:', report.title);
  console.log('Numeric title/watch links found:', report.totalNumericLinks);
  console.log('\n--- link samples (first 12) ---');
  for (const it of report.items) {
    console.log(JSON.stringify(it, null, 2));
  }

  console.log('\n--- [NDL] console logs captured during the wait ---');
  for (const l of ndlLogs) console.log(l);
  if (ndlLogs.length === 0) console.log('(none — content script may not have run, or no cards were found)');

  console.log('\nKeeping the browser open for 60s for manual inspection, then closing.');
  await page.waitForTimeout(60_000);
  await context.close();
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
