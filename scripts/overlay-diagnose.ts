// Diagnostic: load the extension into real Chrome and check whether the
// content script runs on primevideo.com (confirms the extension loaded).
//   npx tsx scripts/overlay-diagnose.ts
import { chromium } from '@playwright/test';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

async function main(): Promise<void> {
  const dist = join(process.cwd(), 'dist');
  const profile = join(process.cwd(), '.playwright-profile-prime');
  const context = await chromium.launchPersistentContext(profile, {
    headless: false,
    // Use Playwright's bundled Chromium (no `channel`) — the user's real
    // Google Chrome has enterprise policies that block --load-extension.
    // Bundled Chromium doesn't read those policies.
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
    viewport: { width: 1440, height: 900 },
  });
  const hex = createHash('sha256').update(join(process.cwd(), 'dist'), 'utf8').digest('hex').slice(0, 32);
  const extId = hex.replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + parseInt(c, 16)));
  console.log('[diag] ext id:', extId);
  console.log('[diag] serviceWorkers at launch:', context.serviceWorkers().length);

  const page = context.pages()[0] ?? (await context.newPage());
  const ndlLogs: string[] = [];
  page.on('console', (m) => { const t = m.text(); if (t.includes('[NDL]')) { ndlLogs.push(t); console.log('  LOG:', t); } });
  page.on('pageerror', (e) => console.log('  PAGEERR:', e.message));

  console.log('[diag] navigating to chrome://extensions ...');
  await page.goto('chrome://extensions/').catch((e) => console.log('[diag] ext page err:', e.message));
  await page.waitForTimeout(2000);
  const extPresent = await page.evaluate((id) => Boolean(document.querySelector(`extensions-manager`)) , extId).catch(() => 'eval-failed');
  console.log('[diag] chrome://extensions loaded:', extPresent);

  console.log('[diag] navigating to primevideo.com ...');
  await page.goto('https://www.primevideo.com/', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(8000);
  console.log('[diag] NDL logs captured:', ndlLogs.length);
  console.log('[diag] serviceWorkers now:', context.serviceWorkers().length);
  const stamped = await page.evaluate(() => document.querySelectorAll('[data-ndl-id]').length).catch(() => -1);
  console.log('[diag] stamped cards:', stamped);
  await page.screenshot({ path: join(process.cwd(), 'diag-prime.png') }).catch(() => {});
  console.log('[diag] screenshot -> diag-prime.png');
  await page.waitForTimeout(3000);
  await context.close();
}
void main().catch((e) => { console.error(e); process.exit(1); });
