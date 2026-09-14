// Live DOM probe for any supported platform — validates the adapter's
// selectors against the REAL site DOM (after you log in). Does NOT need an
// OMDb key.
//
//   npm run probe:hotstar
//   npm run probe:prime
//   npm run probe:netflix
//
// A persistent Chromium profile is used per platform so you stay logged in
// between runs. Log in when the window opens, browse to a page with title
// cards, then return to the terminal and press Enter to run the probe.
//
// The probe dumps selector match counts and a few sample cards so you can
// tune the adapter's CARD_LINK_SELECTORS / title sources exactly as was done
// for Netflix.

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

type Target = 'netflix' | 'hotstar' | 'prime';

const TARGETS: Record<Target, { url: string; profile: string; selectors: string[] }> = {
  netflix: {
    url: 'https://www.netflix.com/',
    profile: '.playwright-profile-netflix',
    selectors: [
      'a[href*="/title/"]', 'a[href*="/watch/"]', 'a[href*="jbv="]',
      'a[data-uia="standard-card"]', '.title-card', '.fallback-text',
      '[data-id]', '[aria-label]',
    ],
  },
  hotstar: {
    url: 'https://www.hotstar.com/',
    profile: '.playwright-profile-hotstar',
    selectors: [
      'a[href*="/movies/"]', 'a[href*="/tv/"]', 'a[href*="/show/"]', 'a[href*="/series/"]',
      '[class*="card"]', '[data-testid*="card"]', '[class*="tile"]',
      'img[alt]', '[aria-label]',
    ],
  },
  prime: {
    url: 'https://www.primevideo.com/',
    profile: '.playwright-profile-prime',
    selectors: [
      'a[href*="/detail/"]', 'a[href*="/gp/video/"]',
      'a[data-testid*="card"]', 'a[data-testid*="title"]',
      '[data-testid*="card"]', '[class*="card"]', '[class*="tile"]',
      'img[alt]', '[aria-label]',
    ],
  },
};

async function prompt(msg: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(msg, () => { rl.close(); resolve(); }));
}

async function main(): Promise<void> {
  const arg = (process.argv[2] ?? '').replace(/^--target=/, '') as Target;
  const target: Target = arg in TARGETS ? arg : 'netflix';
  const cfg = TARGETS[target];

  mkdirSync(cfg.profile, { recursive: true });
  const context = await chromium.launchPersistentContext(join(process.cwd(), cfg.profile), {
    headless: false,
    channel: undefined,
  });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(cfg.url);

  console.log(`\nA Chromium window opened for ${target} (${cfg.url}).`);
  console.log('1. Log in if needed.');
  console.log('2. Browse to a page that shows title cards (home grid, a genre row, etc.).');
  console.log('3. Come back here and press Enter to run the probe.\n');
  await prompt('Press Enter when ready...');

  const report = await page.evaluate((sels) => {
    const out: Record<string, number> = {};
    for (const s of sels) {
      try { out[s] = document.querySelectorAll(s).length; } catch { out[s] = -1; }
    }
    // Grab a few anchor-like card candidates and dump their structure.
    const sample: unknown[] = [];
    const anchors = Array.from(document.querySelectorAll('a[href]')).slice(0, 200);
    let pushed = 0;
    for (const a of anchors) {
      if (pushed >= 8) break;
      const el = (a as HTMLElement).closest<HTMLElement>('[class*="card"],[data-testid*="card"],[role="listitem"],li') ?? (a as HTMLElement);
      const aria = el.getAttribute('aria-label') ?? a.getAttribute('aria-label');
      if (!aria && !el.querySelector('img[alt]')) continue;
      sample.push({
        tag: el.tagName,
        cls: el.className,
        href: a.getAttribute('href'),
        ariaLabel: aria,
        imgAlt: el.querySelector('img')?.getAttribute('alt'),
        text: (el.textContent ?? '').trim().slice(0, 80),
      });
      pushed++;
    }
    return { counts: out, sample, url: location.href };
  }, cfg.selectors);

  console.log(`\n=== ${target} DOM probe results ===`);
  console.log('URL:', report.url);
  console.log('Selector match counts:');
  for (const [s, n] of Object.entries(report.counts)) {
    const flag = (n as number) > 0 ? 'OK ' : 'MISS';
    console.log(`  ${flag} ${String(n).padStart(4)}  ${s}`);
  }
  console.log('\nSample card candidates:');
  for (const c of report.sample) console.log(' ', JSON.stringify(c));

  console.log('\nKeeping the browser open. Close it manually, or press Enter here to exit.');
  await prompt('Press Enter to close...');
  await context.close();
}

void main().catch((e) => { console.error(e); process.exit(1); });
