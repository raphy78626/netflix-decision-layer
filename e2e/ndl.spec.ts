import { test, expect, type Page } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = process.env.NDL_E2E_PORT ?? '0';
const BASE = `http://localhost:${PORT}`;
const __dirname = fileURLToPath(new URL('.', import.meta.url));

function findContentBundle(): string {
  const dir = join(__dirname, '..', 'dist', 'assets');
  const candidates = readdirSync(dir).filter(
    (f) => /^index\.ts-[^l].*\.js$/.test(f), // content entry, not the loader
  );
  if (candidates.length === 0) throw new Error('Content script bundle not found. Run `npm run build` first.');
  return `/dist/assets/${candidates[0]}`;
}

// Canned OMDb ratings keyed by title (matches the mock page cards)
const CANNED_RATINGS: Record<string, object> = {
  Inception: {
    imdbId: 'tt1375666',
    title: 'Inception',
    year: 2010,
    type: 'movie',
    imdbRating: 8.8,
    imdbVotes: 2500000,
    rtCritics: 87,
    metacritic: 74,
    genres: ['Action', 'Adventure', 'Sci-Fi'],
    runtimeMinutes: 148,
    plot: 'A thief who steals corporate secrets through dream-sharing technology.',
    fetchedAt: Date.now(),
  },
  'The Room': {
    imdbId: 'tt0368226',
    title: 'The Room',
    year: 2003,
    type: 'movie',
    imdbRating: 3.7,
    imdbVotes: 60000,
    rtCritics: 25,
    metacritic: 9,
    genres: ['Drama'],
    runtimeMinutes: 99,
    plot: 'A melodramatic story of a love triangle.',
    fetchedAt: Date.now(),
  },
  'The Crown': {
    imdbId: 'tt4786824',
    title: 'The Crown',
    year: 2016,
    type: 'series',
    imdbRating: 8.6,
    imdbVotes: 120000,
    rtCritics: 89,
    metacritic: 87,
    genres: ['Drama', 'History'],
    runtimeMinutes: 58,
    plot: 'Follows the political rivalries and romance of Queen Elizabeth II.',
    fetchedAt: Date.now(),
  },
};

const DEFAULT_SETTINGS = {
  omdbApiKey: 'test-key',
  overlayEnabled: true,
  filterEnabled: false,
  personalizationEnabled: true,
  minImdb: 0,
  minRt: 0,
  minMetacritic: 0,
  filterMode: 'fade',
};

// Stub the chrome extension APIs the content script uses.
// Reads settings fresh from window.__NDL_SETTINGS__ on each get() call
// (so tests can set settings AFTER addInitScript but BEFORE the content script loads).
function chromeStubSource(): string {
  const ratingsJson = JSON.stringify(CANNED_RATINGS);
  const defaultsJson = JSON.stringify(DEFAULT_SETTINGS);
  return `
  (function () {
    const CANNED = ${ratingsJson};
    const DEFAULTS = ${defaultsJson};
    const listeners = [];
    function currentSettings() {
      return window.__NDL_SETTINGS__ || DEFAULTS;
    }
    window.chrome = {
      runtime: {
        sendMessage: function (msg, cb) {
          setTimeout(function () {
            if (msg && msg.kind === 'resolve') {
              const r = CANNED[msg.title];
              if (r) cb({ kind: 'resolve-ok', status: 'fresh', ratings: r });
              else cb({ kind: 'resolve-notfound' });
            } else {
              cb({ kind: 'resolve-error', message: 'unknown' });
            }
          }, 5);
        },
      },
      storage: {
        sync: {
          get: async function () { return {}; },
          set: async function () {},
        },
        local: {
          get: async function (key) {
            const obj = {};
            obj[key] = currentSettings();
            return obj;
          },
          set: async function () {},
        },
        onChanged: {
          addListener: function (fn) { listeners.push(fn); },
          removeListener: function () {},
        },
      },
    };
    window.__ndlDispatchSettings = function (next) {
      const changes = { ndl_settings: { oldValue: currentSettings(), newValue: next } };
      for (const fn of listeners) fn(changes, 'local');
    };
  })();
  `;
}

async function loadMockPage(page: Page, settings: object = DEFAULT_SETTINGS): Promise<void> {
  await page.addInitScript(chromeStubSource());
  await page.goto(`${BASE}/e2e/netflix-mock.html`);
  await page.evaluate((s) => {
    (window as unknown as { __NDL_SETTINGS__: object }).__NDL_SETTINGS__ = s;
  }, settings);
  const bundle = findContentBundle();
  await page.addScriptTag({ type: 'module', url: `${BASE}${bundle}` });
}

test('overlay: badges are injected on all three cards', async ({ page }) => {
  await loadMockPage(page);
  // Wait for badges (Playwright pierces open shadow roots)
  await expect(page.locator('.ndl-badge').first()).toBeVisible({ timeout: 8000 });
  const count = await page.locator('.ndl-badge').count();
  expect(count).toBeGreaterThanOrEqual(3);
});

test('overlay: IMDb badge shows the rating value', async ({ page }) => {
  await loadMockPage(page);
  await expect(page.locator('.ndl-badge.imdb').first()).toBeVisible({ timeout: 8000 });
  const inceptionCard = page.locator('.title-card', { hasText: 'Inception' }).first();
  await expect(inceptionCard.locator('.ndl-badge.imdb')).toContainText('8.8');
});

test('overlay: each tile shows its OWN IMDb rating (no same-value leak across tiles)', async ({ page }) => {
  // Regression for the "the same rating shows on every tile" bug: distinct
  // cards must never collapse onto one fingerprint / one cached rating.
  await loadMockPage(page);
  await expect(page.locator('.ndl-badge.imdb').first()).toBeVisible({ timeout: 8000 });
  const getImdb = (title: string) =>
    page
      .locator('.title-card', { hasText: title })
      .first()
      .locator('.ndl-badge.imdb')
      .textContent();
  const inception = await getImdb('Inception');
  const room = await getImdb('The Room');
  const crown = await getImdb('The Crown');
  expect(inception).toContain('8.8');
  expect(room).toContain('3.7');
  expect(crown).toContain('8.6');
  // All three values must be present and pairwise different.
  expect(new Set([inception, room, crown]).size).toBe(3);
});

test('overlay: RT badge is colored fresh for high scores and rotten for low', async ({ page }) => {
  await loadMockPage(page);
  await expect(page.locator('.ndl-badge.rt-fresh, .ndl-badge.rt-rotten').first()).toBeVisible({ timeout: 8000 });
  // Inception (87%) -> fresh; The Room (25%) -> rotten
  const inception = page.locator('.title-card', { hasText: 'Inception' }).first();
  await expect(inception.locator('.ndl-badge.rt-fresh')).toContainText('87%');
  const room = page.locator('.title-card', { hasText: 'The Room' }).first();
  await expect(room.locator('.ndl-badge.rt-rotten')).toContainText('25%');
});

test('filter: fades low-rated cards when filter enabled with high IMDb threshold', async ({ page }) => {
  const settings = { ...DEFAULT_SETTINGS, filterEnabled: true, minImdb: 9, filterMode: 'fade' };
  await loadMockPage(page, settings);
  await expect(page.locator('.ndl-badge').first()).toBeVisible({ timeout: 8000 });
  // Wait a tick for filter to apply after ratings arrive
  await page.waitForTimeout(500);
  const room = page.locator('.title-card', { hasText: 'The Room' }).first();
  const opacity = await room.evaluate((el) => getComputedStyle(el).opacity);
  expect(parseFloat(opacity)).toBeLessThan(1);
  // Inception (8.8) is also below 9, so it should be faded too; The Crown (8.6) faded.
  // All three are below 9 -> all faded.
  const inception = page.locator('.title-card', { hasText: 'Inception' }).first();
  const inceptionOpacity = await inception.evaluate((el) => getComputedStyle(el).opacity);
  expect(parseFloat(inceptionOpacity)).toBeLessThan(1);
});

test('filter: hides low-rated cards in hide mode', async ({ page }) => {
  const settings = { ...DEFAULT_SETTINGS, filterEnabled: true, minImdb: 8, filterMode: 'hide' };
  await loadMockPage(page, settings);
  await expect(page.locator('.ndl-badge').first()).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(500);
  const room = page.locator('.title-card', { hasText: 'The Room' }).first();
  const display = await room.evaluate((el) => getComputedStyle(el).display);
  expect(display).toBe('none');
  // Inception (8.8) >= 8 -> visible
  const inception = page.locator('.title-card', { hasText: 'Inception' }).first();
  const inceptionDisplay = await inception.evaluate((el) => getComputedStyle(el).display);
  expect(inceptionDisplay).not.toBe('none');
});

test('hover: shows hover card with title and ratings on mouseenter', async ({ page }) => {
  await loadMockPage(page);
  await expect(page.locator('.ndl-badge').first()).toBeVisible({ timeout: 8000 });
  const inception = page.locator('.title-card', { hasText: 'Inception' }).first();
  await inception.hover();
  await expect(page.locator('.ndl-hover h3')).toContainText('Inception', { timeout: 5000 });
  await expect(page.locator('.ndl-hover')).toContainText('8.8');
});

test('preferences: clicking a card records a signal in IndexedDB', async ({ page }) => {
  await loadMockPage(page);
  await expect(page.locator('.ndl-badge').first()).toBeVisible({ timeout: 8000 });
  // Dispatch a synthetic click on the card div itself (not the inner <a>) to avoid navigation.
  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.title-card'));
    const card = cards.find((c) => (c.textContent ?? '').includes('Inception'));
    card?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  // Give the async recordSignal a moment
  await page.waitForTimeout(500);
  const signalCount = await page.evaluate(async () => {
    return new Promise<number>((resolve, reject) => {
      const req = indexedDB.open('ndl-prefs');
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('signals')) return resolve(0);
        const tx = db.transaction('signals', 'readonly');
        const store = tx.objectStore('signals');
        const countReq = store.count();
        countReq.onsuccess = () => resolve(countReq.result);
        countReq.onerror = () => reject(countReq.error);
      };
      req.onerror = () => reject(req.error);
    });
  });
  expect(signalCount).toBeGreaterThanOrEqual(1);
});

test('preferences: match % badge appears (cold-start uses IMDb as proxy)', async ({ page }) => {
  await loadMockPage(page);
  await expect(page.locator('.ndl-badge.match').first()).toBeVisible({ timeout: 8000 });
  // Inception IMDb 8.8 -> cold-start match 88
  const inception = page.locator('.title-card', { hasText: 'Inception' }).first();
  await expect(inception.locator('.ndl-badge.match')).toContainText('88%');
});
