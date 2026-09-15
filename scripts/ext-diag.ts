// Screenshot chrome://extensions to see if our extension loaded and is enabled.
import { chromium } from '@playwright/test';
import { join } from 'node:path';

async function main(): Promise<void> {
  const dist = join(process.cwd(), 'dist');
  const profile = join(process.cwd(), '.playwright-profile-extdiag');
  const context = await chromium.launchPersistentContext(profile, {
    headless: false,
    channel: 'chrome',
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
    viewport: { width: 1440, height: 900 },
  });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto('chrome://extensions/').catch((e) => console.log('nav err', e.message));
  await page.waitForTimeout(3000);
  // Try to enable developer mode + read the extensions list.
  const info = await page.evaluate(() => {
    const mgr = document.querySelector('extensions-manager');
    return { hasMgr: Boolean(mgr), bodyText: document.body.innerText.slice(0, 2000) };
  }).catch((e) => ({ error: String(e) }));
  console.log('[extdiag] info:', JSON.stringify(info, null, 2));
  await page.screenshot({ path: join(process.cwd(), 'diag-extensions.png') });
  console.log('[extdiag] screenshot -> diag-extensions.png');
  await page.waitForTimeout(3000);
  await context.close();
}
void main().catch((e) => { console.error(e); process.exit(1); });
