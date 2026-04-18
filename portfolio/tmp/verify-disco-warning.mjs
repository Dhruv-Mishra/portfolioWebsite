// One-shot screenshot: sudo disco warning at iPhone SE width so we have a
// visual proof that Bug 1 fix covers BOTH sudo disco and sudo matrix.

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

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    channel: 'chrome',
    headless: true,
  });
  try {
    for (const [name, w, h] of [['iphonese', 375, 667], ['iphone12pro', 390, 844]]) {
      const context = await browser.newContext({
        viewport: { width: w, height: h },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      await page.addInitScript((seed) => {
        try { window.localStorage.setItem('dhruv-stickers', JSON.stringify(seed)); } catch { /* noop */ }
      }, SEED_STORAGE);
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.waitForSelector('input[aria-label="Terminal Command Input"]', { timeout: 10000 });

      await page.click('input[aria-label="Terminal Command Input"]');
      await page.fill('input[aria-label="Terminal Command Input"]', 'sudo disco');
      await page.press('input[aria-label="Terminal Command Input"]', 'Enter');
      await page.waitForTimeout(400);

      const m = await page.evaluate(() => ({
        docScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
      }));
      console.log(`[${name}-sudo-disco-warn] widths:`, JSON.stringify(m));
      await page.screenshot({ path: resolve(OUT, `${name}-${w}x${h}-07-sudo-disco-warn.png`), fullPage: false });

      await context.close();
    }
  } finally {
    await browser.close();
  }
})();
