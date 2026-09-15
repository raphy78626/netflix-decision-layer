// Auto-polling live DOM probe for a scaffolded platform. Non-interactive:
// opens a headed Chromium, you log in and browse to a card grid, and it
// auto-dumps selector counts + sample card HTML + a screenshot when it
// detects a card grid (or after a 4-min timeout).
//
//   npx tsx scripts/platform-autoprobe.ts --target=hotstar
//   npx tsx scripts/platform-autoprobe.ts --target=prime
//
// Output: probe-<target>.json + probe-<target>.png
//
// NOTE: avoid declaring inner named functions inside page.evaluate — tsx
// (esbuild) injects __name() helpers that are undefined in the browser and
// throw "ReferenceError: __name is not defined". Inline logic with loops only.

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type Target = 'hotstar' | 'prime';

const TARGETS: Record<Target, {
  url: string;
  profile: string;
  cardLinkSelectors: string[];
  broadSelectors: string[];
}> = {
  hotstar: {
    url: 'https://www.hotstar.com/',
    profile: '.playwright-profile-hotstar',
    cardLinkSelectors: [
      'a[href*="/movies/"]', 'a[href*="/tv/"]', 'a[href*="/show/"]', 'a[href*="/series/"]',
    ],
    broadSelectors: [
      'a[href]', 'a[href*="/movies/"]', 'a[href*="/tv/"]', 'a[href*="/show/"]',
      'a[href*="/series/"]', 'a[href*="/watch/"]', 'a[href*="/detail/"]',
      '[class*="card"]', '[data-testid*="card"]', '[class*="tile"]', 'img[alt]',
    ],
  },
  prime: {
    url: 'https://www.primevideo.com/',
    profile: '.playwright-profile-prime',
    cardLinkSelectors: [
      'a[href*="/detail/"]', 'a[href*="/gp/video/"]',
      'a[data-testid*="card"]', 'a[data-testid*="title"]',
    ],
    broadSelectors: [
      'a[href]', 'a[href*="/detail/"]', 'a[href*="/gp/video/"]',
      'a[data-testid*="card"]', 'a[data-testid*="title"]',
      '[data-testid*="card"]', '[class*="card"]', '[class*="tile"]', 'img[alt]',
    ],
  },
};

async function main(): Promise<void> {
  const arg = (process.argv[2] ?? '').replace(/^--target=/, '') as Target;
  const target: Target = arg in TARGETS ? arg : 'hotstar';
  const cfg = TARGETS[target];

  mkdirSync(cfg.profile, { recursive: true });
  const context = await chromium.launchPersistentContext(join(process.cwd(), cfg.profile), {
    headless: false,
    channel: undefined,
    viewport: { width: 1440, height: 900 },
  });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(cfg.url, { waitUntil: 'domcontentloaded' }).catch(() => {});

  console.log(`\n[${target}] Browser open at ${cfg.url}`);
  console.log(`[${target}] Log in, then browse to a page with a grid of title cards.`);
  console.log(`[${target}] Auto-detecting a card grid (polling up to 4 min)...\n`);

  const allSels = [...cfg.broadSelectors, ...cfg.cardLinkSelectors];
  const deadline = Date.now() + 4 * 60 * 1000;
  let triggered = false;

  while (Date.now() < deadline) {
    const counts = await page.evaluate((sels) => {
      const out: Record<string, number> = {};
      for (const s of sels) {
        try { out[s] = document.querySelectorAll(s).length; } catch { out[s] = -1; }
      }
      return out;
    }, allSels).catch(() => ({} as Record<string, number>));

    const maxBroad = Math.max(0, ...cfg.broadSelectors.map((s) => counts[s] ?? 0));
    const maxAdapter = Math.max(0, ...cfg.cardLinkSelectors.map((s) => counts[s] ?? 0));
    process.stdout.write(`[${target}] ${new Date().toISOString().slice(11, 19)} url=${page.url().slice(0, 55)} broadMax=${maxBroad} adapterMax=${maxAdapter}    \r`);

    // Trigger only when the ADAPTER's own card-link selectors match real
    // content cards (>=4), so we don't dump prematurely on nav-heavy pages.
    if (maxAdapter >= 4) {
      triggered = true;
      console.log(`\n[${target}] Card grid detected (adapterMax=${maxAdapter}, broadMax=${maxBroad}). Dumping...\n`);
      break;
    }
    await page.waitForTimeout(3000);
  }

  if (!triggered) {
    console.log(`\n[${target}] No card grid detected within timeout. Dumping current page anyway.\n`);
  }

  // Selector-agnostic rich dump: collect any anchor that looks like a content
  // card (has aria-label OR contains an img with alt), dedupe by container.
  // No inner function declarations (avoids esbuild __name in browser).
  const report = await page.evaluate((p) => {
    const cardLinkSelectors = p.cardLinkSelectors as string[];
    const broadSelectors = p.broadSelectors as string[];

    const counts: Record<string, number> = {};
    for (const s of [...broadSelectors, ...cardLinkSelectors]) {
      try { counts[s] = document.querySelectorAll(s).length; } catch { counts[s] = -1; }
    }

    const samples: unknown[] = [];
    const seen = new Set<Element>();
    let pushed = 0;
    // First, sample anchors matching the ADAPTER's card-link selectors
    // (the real content cards), so nav links don't crowd them out.
    const cardSel = (p.cardLinkSelectors as string[]) || [];
    const ordered: HTMLElement[] = [];
    for (const sel of cardSel) {
      Array.from(document.querySelectorAll<HTMLElement>(sel)).forEach((a) => ordered.push(a));
    }
    // Then append all other anchors as a fallback.
    Array.from(document.querySelectorAll<HTMLElement>('a[href]')).forEach((a) => ordered.push(a));
    for (let idx = 0; idx < ordered.length && pushed < 15; idx++) {
      const a = ordered[idx];
      const href = a.getAttribute('href') ?? '';
      const aria = a.getAttribute('aria-label');
      const img = a.querySelector('img') || (a.parentElement?.querySelector('img') ?? null);
      const imgAlt = img ? img.getAttribute('alt') : null;
      // Only anchors that look like a content tile: have aria-label or an image.
      if (!aria && !imgAlt) continue;
      // Walk up to a single-title container (stop when parent holds >1 such anchor).
      let container: HTMLElement = a;
      for (let i = 0; i < 8 && container.parentElement; i++) {
        const parent = container.parentElement;
        const inner = parent.querySelectorAll('a[href]');
        if (inner.length > 1) break;
        container = parent;
      }
      if (seen.has(container)) continue;
      seen.add(container);
      samples.push({
        href,
        ariaLabel: aria,
        titleAttr: a.getAttribute('title'),
        imgAlt,
        anchorClass: (a.className || '').toString().slice(0, 140),
        containerTag: container.tagName,
        containerClass: (container.className || '').toString().slice(0, 160),
        containerText: (container.textContent || '').trim().slice(0, 100),
        containerOuterHTML: container.outerHTML.slice(0, 700),
      });
      pushed++;
    }

    // Also dump the distinct href "path families" (first 2 path segments) to
    // discover the real URL pattern of title cards.
    const pathFamilies: Record<string, number> = {};
    for (const a of ordered) {
      const href = a.getAttribute('href') ?? '';
      if (!href.startsWith('/') && !href.startsWith('http')) continue;
      const m = href.match(/^https?:\/\/[^/]+(\/[^/?#]+\/[^/?#]+)/);
      const family = m ? m[1] : (href.match(/^\/[^/?#]+\/[^/?#]+/) ? href.match(/^\/[^/?#]+\/[^/?#]+/)![0] : null);
      if (family) pathFamilies[family] = (pathFamilies[family] ?? 0) + 1;
    }

    return {
      url: location.href,
      title: document.title,
      counts,
      adapterDetected: samples.length,
      hrefPathFamilies: pathFamilies,
      samples,
    };
  }, { cardLinkSelectors: cfg.cardLinkSelectors, broadSelectors: cfg.broadSelectors }).catch((e) => ({ error: String(e) }));

  const screenshotPath = join(process.cwd(), `probe-${target}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});

  const reportPath = join(process.cwd(), `probe-${target}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`[${target}] report  -> ${reportPath}`);
  console.log(`[${target}] screen  -> ${screenshotPath}`);

  if (report && typeof report === 'object' && 'counts' in report) {
    const r = report as { url: string; counts: Record<string, number>; adapterDetected: number; hrefPathFamilies: Record<string, number> };
    console.log(`\n[${target}] URL: ${r.url}`);
    console.log(`[${target}] Selector counts:`);
    for (const [s, n] of Object.entries(r.counts)) {
      const flag = n > 0 ? 'OK  ' : 'MISS';
      console.log(`  ${flag} ${String(n).padStart(4)}  ${s}`);
    }
    console.log(`\n[${target}] Distinct href path families (top 15):`);
    const fams = Object.entries(r.hrefPathFamilies).sort((a, b) => b[1] - a[1]).slice(0, 15);
    for (const [fam, n] of fams) console.log(`  ${String(n).padStart(4)}  ${fam}`);
    console.log(`\n[${target}] Sample card candidates: ${r.adapterDetected}`);
  }

  console.log(`\n[${target}] Closing browser in 3s...`);
  await page.waitForTimeout(3000);
  await context.close();
}

void main().catch((e) => { console.error(e); process.exit(1); });
