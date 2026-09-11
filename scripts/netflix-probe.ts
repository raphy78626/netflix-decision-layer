// Live Netflix DOM probe — validates the extractor selectors against the REAL
// Netflix browse DOM (after you log in). Does NOT need an OMDb key.
//
//   npx tsx scripts/netflix-probe.ts
//
// A persistent Chromium profile is used so you stay logged in between runs.
// Log into Netflix when the window opens, browse to a page with title cards,
// then return to the terminal and press Enter to run the probe.

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const PROFILE_DIR = join(process.cwd(), '.playwright-profile');

const SELECTORS = [
  '.title-card',
  '[data-ui-tracking-context*="titleCard"]',
  '.fallback-text',
  'a[href*="/title/"]',
  '[data-id]',
  '[aria-label]',
];

async function prompt(msg: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(msg, () => { rl.close(); resolve(); }));
}

async function main(): Promise<void> {
  mkdirSync(PROFILE_DIR, { recursive: true });
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    channel: undefined, // use Playwright's bundled Chromium
  });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto('https://www.netflix.com/');

  console.log('\nA Chromium window opened.');
  console.log('1. Log into Netflix if needed.');
  console.log('2. Browse to any page that shows title cards (e.g. the home browse grid, a genre row).');
  console.log('3. Come back here and press Enter to run the probe.\n');
  await prompt('Press Enter when ready...');

  const report = await page.evaluate((sels) => {
    const out: Record<string, number> = {};
    for (const s of sels) {
      try {
        out[s] = document.querySelectorAll(s).length;
      } catch {
        out[s] = -1;
      }
    }
    // Try to extract a sample card
    const sample: unknown[] = [];
    const cards = document.querySelectorAll('.title-card, [data-id], a[href*="/title/"]');
    cards.forEach((c, i) => {
      if (i >= 5) return;
      const el = (c as HTMLElement).closest<HTMLElement>('.title-card, [data-id], [data-ui-tracking-context]') ?? (c as HTMLElement);
      sample.push({
        tag: el.tagName,
        dataId: el.getAttribute('data-id'),
        ariaLabel: el.getAttribute('aria-label') ?? el.querySelector('[aria-label]')?.getAttribute('aria-label'),
        fallbackText: el.querySelector('.fallback-text')?.textContent?.trim(),
        href: el.querySelector('a[href*="/title/"]')?.getAttribute('href'),
      });
    });
    return { counts: out, sample, url: location.href };
  }, SELECTORS);

  console.log('\n=== Netflix DOM probe results ===');
  console.log('URL:', report.url);
  console.log('Selector match counts:');
  for (const [s, n] of Object.entries(report.counts)) {
    const flag = n > 0 ? 'OK ' : 'MISS';
    console.log(`  ${flag} ${n.toString().padStart(4)}  ${s}`);
  }
  console.log('\nSample cards extracted:');
  for (const c of report.sample) {
    console.log(' ', JSON.stringify(c));
  }

  console.log('\nKeeping the browser open. Close it manually when done, or press Enter here to exit.');
  await prompt('Press Enter to close...');
  await context.close();
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
