// Load the built extension into Playwright's bundled Chromium, set the OMDb
// API key via the extension's service worker, browse to a streaming site,
// wait for our rating badges to render, and screenshot.
//
//   npx tsx scripts/overlay-screenshot.ts --target=prime --key=YOUR_OMDB_KEY
//   npx tsx scripts/overlay-screenshot.ts --target=hotstar --key=YOUR_OMDB_KEY
//
// Output: overlay-<target>.png
//
// Uses Playwright's bundled Chromium (no `channel`) because the user's real
// Google Chrome has enterprise policies that silently block --load-extension.

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

type Target = 'prime' | 'hotstar' | 'netflix';

const TARGETS: Record<Target, { url: string; profile: string }> = {
  prime: { url: 'https://www.primevideo.com/', profile: '.playwright-profile-prime' },
  hotstar: { url: 'https://www.hotstar.com/in/movies', profile: '.playwright-profile-hotstar' },
  netflix: { url: 'https://www.netflix.com/browse', profile: '.playwright-profile-netflix' },
};

function arg(name: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : undefined;
}

async function main(): Promise<void> {
  const target = (arg('target') as Target) ?? 'prime';
  const key = arg('key');
  if (!key) { console.error('Missing --key=<OMDB_API_KEY>'); process.exit(1); }
  const cfg = TARGETS[target];
  const dist = join(process.cwd(), 'dist');

  mkdirSync(cfg.profile, { recursive: true });
  const context = await chromium.launchPersistentContext(join(process.cwd(), cfg.profile), {
    headless: false,
    // No `channel` → use Playwright's bundled Chromium. The user's real
    // Google Chrome is managed by enterprise policies that block
    // --load-extension, so the extension never loads there.
    args: [
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
    ],
    viewport: { width: 1440, height: 900 },
  });

  const distAbs = join(process.cwd(), 'dist');
  const hex = createHash('sha256').update(distAbs, 'utf8').digest('hex').slice(0, 32);
  const extId = hex.replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + parseInt(c, 16)));
  console.log(`[overlay] extension id: ${extId}`);

  const page = context.pages()[0] ?? (await context.newPage());
  page.on('console', (m) => {
    const t = m.text();
    if (t.includes('[NDL]')) console.log(`  ${t}`);
  });
  page.on('pageerror', (e) => console.log(`  PAGEERROR: ${e.message}`));

  // Navigate to a non-matched page first to force the extension's service
  // worker to register (example.com isn't in the manifest matches, so no
  // content script runs there).
  await page.goto('https://example.com/').catch(() => {});
  console.log(`[overlay] Waiting for extension service worker...`);
  let sw = context.serviceWorkers()[0] ?? null;
  const swDeadline = Date.now() + 30_000;
  while (!sw && Date.now() < swDeadline) {
    await new Promise((r) => setTimeout(r, 300));
    sw = context.serviceWorkers()[0] ?? null;
  }
  if (!sw) {
    console.log(`[overlay] WARN: no service worker after 30s; aborting.`);
    await context.close();
    process.exit(1);
  }
  await sw.evaluate((k) => {
    return new Promise<void>((resolve) => {
      chrome.storage.local.set({ ndl_settings: {
        omdbApiKey: k, overlayEnabled: true, filterEnabled: false,
        personalizationEnabled: true, minImdb: 0, minRt: 0, minMetacritic: 0, filterMode: 'fade',
      } }, () => resolve());
    });
  }, key);
  console.log(`[overlay] OMDb key set via service worker.`);

  console.log(`[overlay] Navigating to ${cfg.url} ...`);
  await page.goto(cfg.url, { waitUntil: 'domcontentloaded' }).catch(() => {});

  // Wait for the content script to attach `.ndl-card-host` shadow hosts to
  // cards, then wait for the badge text to populate (OMDb resolution can
  // take a few seconds per title). The extension stamps `.ndl-card-host`
  // (not data-ndl-id) on each card it processes.
  console.log(`[overlay] Waiting for badges to render (up to 90s)...`);
  let hosts = 0;
  let withBadges = 0;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const res = await page.evaluate(() => {
      const hosts = document.querySelectorAll<HTMLElement>('.ndl-card-host');
      let nonEmpty = 0;
      hosts.forEach((h) => {
        if (!h.shadowRoot) return;
        const txt = h.shadowRoot.querySelector('.ndl-badges')?.textContent ?? '';
        if (txt.trim().length > 0) nonEmpty++;
      });
      return { hosts: hosts.length, nonEmpty };
    }).catch(() => ({ hosts: 0, nonEmpty: 0 }));
    hosts = res.hosts; withBadges = res.nonEmpty;
    process.stdout.write(`[overlay] cardHosts=${res.hosts} badgesWithText=${res.nonEmpty}    \r`);
    if (res.nonEmpty >= 3) {
      console.log(`\n[overlay] Badges rendered on ${res.nonEmpty} card(s).`);
      break;
    }
    await page.waitForTimeout(2000);
  }

  // Give it a few extra seconds for more badges to fill in.
  await page.waitForTimeout(5000);

  // Diagnostic: are cards being wired but hosts not attached? If
  // [data-ndl-wired] > 0 but .ndl-card-host == 0, the card elements are
  // being detached by the SPA before the async resolve callback appends the
  // badge host.
  const diag = await page.evaluate(() => ({
    wired: document.querySelectorAll('[data-ndl-wired="1"]').length,
    hosts: document.querySelectorAll('.ndl-card-host').length,
    detailLinks: document.querySelectorAll('a[href*="/detail/"]').length,
  })).catch(() => ({ wired: 0, hosts: 0, detailLinks: 0 }));
  console.log(`[overlay] diag: wired=${diag.wired} hosts=${diag.hosts} detailLinks=${diag.detailLinks}`);

  // Log the actual badge text + screen rect of the first few badged cards so
  // we can confirm the ratings are real and visible.
  const samples = await page.evaluate(() => {
    const out: { text: string; rect: { x: number; y: number; w: number; h: number } }[] = [];
    document.querySelectorAll<HTMLElement>('.ndl-card-host').forEach((h) => {
      if (!h.shadowRoot) return;
      const txt = h.shadowRoot.querySelector('.ndl-badges')?.textContent ?? '';
      if (!txt.trim()) return;
      const r = h.getBoundingClientRect();
      out.push({ text: txt.replace(/\s+/g, ' ').trim(), rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } });
    });
    return out.slice(0, 8);
  }).catch(() => []);
  console.log(`[overlay] badge samples:`);
  samples.forEach((s, i) => console.log(`  [${i + 1}] "${s.text}" @ ${JSON.stringify(s.rect)}`));

  const outPath = join(process.cwd(), `overlay-${target}.png`);
  await page.screenshot({ path: outPath, fullPage: true });
  console.log(`\n[overlay] cardHosts=${hosts} cardsWithBadges=${withBadges}`);
  console.log(`[overlay] screenshot -> ${outPath}`);

  // Also capture a close-up of the first badged card so the rating text is
  // legible in at least one frame.
  if (samples.length > 0) {
    const s = samples[0];
    const pad = 40;
    const clip = {
      x: Math.max(0, s.rect.x - pad),
      y: Math.max(0, s.rect.y - pad),
      width: Math.min(s.rect.w + pad * 2, 1440),
      height: Math.min(s.rect.h + pad * 2, 900),
    };
    await page.screenshot({ path: join(process.cwd(), `overlay-${target}-zoom.png`), clip });
    console.log(`[overlay] close-up -> overlay-${target}-zoom.png`);
  }

  console.log(`[overlay] Keeping browser open for 10s for inspection...`);
  await page.waitForTimeout(10_000);
  await context.close();
}

void main().catch((e) => { console.error(e); process.exit(1); });
