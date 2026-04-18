// Desktop regression check — confirms the Bug 1 fix (responsive confirm
// warning) still renders well at desktop widths and the existing
// ThemeToggle continues to work. Also screenshots the sudo-matrix warning
// at a desktop viewport so the reviewer can verify the new styling looks
// coherent with the terminal aesthetic (was a pre-rendered ASCII box; now
// a CSS-border banner).

import { chromium } from 'playwright-core';
import { resolve } from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE || 'http://localhost:3000';
const OUT = resolve(process.cwd(), 'tmp/verify-screenshots');

const SEED_STORAGE = {
  version: 6,
  unlocked: ['superuser'],
  unlockedAt: { superuser: Date.now() },
  lastEarnedAt: Date.now(),
  lastSeenAlbumAt: Date.now(),
  visitedRoutes: ['/'],
  terminalCommands: ['help'],
  openedProjects: [],
  soundsMuted: true,
  superuserRevealedAt: Date.now(),
  matrixActive: false,
};

async function measureAndShoot(page, label) {
  const m = await page.evaluate(() => {
    const docEl = document.documentElement;
    return {
      docClientWidth: docEl.clientWidth,
      docScrollWidth: docEl.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      visualViewportWidth: window.visualViewport?.width ?? null,
      visualViewportHeight: window.visualViewport?.height ?? null,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      dataDisco: docEl.dataset.disco ?? null,
      dataMatrix: docEl.dataset.matrix ?? null,
    };
  });
  console.log(`[${label}] measurements:`, JSON.stringify(m));
  await page.screenshot({ path: resolve(OUT, `${label}.png`), fullPage: false });
  return m;
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    channel: 'chrome',
    headless: true,
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await page.addInitScript((seed) => {
      try {
        window.localStorage.setItem('dhruv-stickers', JSON.stringify(seed));
      } catch { /* noop */ }
    }, SEED_STORAGE);

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('input[aria-label="Terminal Command Input"]', { timeout: 10000 });

    await measureAndShoot(page, 'desktop-1440x900-01-initial');

    // Bug 1 — desktop confirm warning still looks good
    await page.click('input[aria-label="Terminal Command Input"]');
    await page.fill('input[aria-label="Terminal Command Input"]', 'sudo matrix');
    await page.press('input[aria-label="Terminal Command Input"]', 'Enter');
    await page.waitForTimeout(400);
    await measureAndShoot(page, 'desktop-1440x900-02-sudo-matrix-warn');

    // Also verify disco on desktop still works (regression guard for 2a/2b)
    await page.fill('input[aria-label="Terminal Command Input"]', 'sudo disco yes');
    await page.press('input[aria-label="Terminal Command Input"]', 'Enter');
    await page.waitForTimeout(2000);
    const discoMeasure = await measureAndShoot(page, 'desktop-1440x900-03-disco-active');
    console.log(`[desktop] data-disco=${discoMeasure.dataDisco}`);

    // Click desktop ThemeToggle (should exit disco)
    const desktopToggle = page.locator('button[aria-label="Exit disco mode"]').first();
    await desktopToggle.waitFor({ state: 'visible', timeout: 5000 });
    await desktopToggle.click();
    await page.waitForTimeout(500);
    const exited = await measureAndShoot(page, 'desktop-1440x900-04-after-desktop-exit');
    console.log(`[desktop] after exit, data-disco=${exited.dataDisco}`);

    await context.close();
  } finally {
    await browser.close();
  }
})();
