// Empirical verification of Bugs 1, 2 (2a/2b/2c), and 3 on mobile viewports.
// Spawns a headless Chrome via playwright-core, using the system Chrome
// binary, at iPhone SE (375×667) and iPhone 12 Pro (390×844) sizes.
//
// NOTE: this is NOT run in CI — it's a one-shot manual verification tool
// invoked from the orchestrator's bug-fix workflow. Results are written
// to tmp/verify-screenshots/*.png so the engineer reviewing the PR can
// eyeball the before/after. Bug assertions run as console.log() output
// rather than hard exceptions so a single failing assertion doesn't kill
// the whole run — we want ALL measurements printed.

import { chromium } from 'playwright-core';
import { resolve } from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE || 'http://localhost:3000';
const OUT = resolve(process.cwd(), 'tmp/verify-screenshots');

const VIEWPORTS = [
  { name: 'iphonese-375x667', width: 375, height: 667, deviceScaleFactor: 2, isMobile: true },
  { name: 'iphone12pro-390x844', width: 390, height: 844, deviceScaleFactor: 3, isMobile: true },
];

// Reproduce an earned-superuser store blob so sudo commands are live. We
// inject this into localStorage before the first navigation; the sticker
// store migrator will run on first read and produce a clean current-version
// shape with superuser unlocked.
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
      bodyClientWidth: document.body.clientWidth,
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

async function runOne(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
    isMobile: viewport.isMobile,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await context.newPage();

  // Seed the sticker store before the app runs. Use an init script so
  // the storage is populated PRIOR to React mount.
  await page.addInitScript((seed) => {
    try {
      window.localStorage.setItem('dhruv-stickers', JSON.stringify(seed));
    } catch {
      /* noop — quota-free in headless */
    }
  }, SEED_STORAGE);

  // --- Navigate to home ---
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  // Wait for terminal to render.
  await page.waitForSelector('input[aria-label="Terminal Command Input"]', { timeout: 10000 });

  console.log(`\n========== VIEWPORT: ${viewport.name} ==========`);

  // ---- Bug 1: sudo matrix warning width ----
  await measureAndShoot(page, `${viewport.name}-01-initial`);

  await page.click('input[aria-label="Terminal Command Input"]');
  await page.fill('input[aria-label="Terminal Command Input"]', 'sudo matrix');
  await page.press('input[aria-label="Terminal Command Input"]', 'Enter');
  await page.waitForTimeout(400);
  const matrixWarnMeasure = await measureAndShoot(page, `${viewport.name}-02-after-sudo-matrix-warn`);

  // Assert no horizontal scroll expansion. A ~1-px rounding delta is fine.
  const hasOverflow = matrixWarnMeasure.docScrollWidth > viewport.width + 2;
  console.log(`[${viewport.name}] BUG 1 — horizontal overflow after sudo matrix warn: ${hasOverflow ? 'FAIL' : 'OK'}`);

  // ---- Bug 3: matrix overlay covers full viewport after `sudo matrix yes` ----
  await page.fill('input[aria-label="Terminal Command Input"]', 'sudo matrix yes');
  await page.press('input[aria-label="Terminal Command Input"]', 'Enter');
  await page.waitForTimeout(1500); // allow overlay to mount + paint

  await measureAndShoot(page, `${viewport.name}-03-matrix-active`);

  const canvasRect = await page.evaluate(() => {
    const canvas = document.querySelector('canvas[aria-hidden="true"]');
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    return { width: r.width, height: r.height, top: r.top, left: r.left };
  });
  console.log(`[${viewport.name}] matrix canvas rect:`, JSON.stringify(canvasRect));
  const canvasFills = canvasRect && Math.abs(canvasRect.width - viewport.width) < 2 && Math.abs(canvasRect.height - viewport.height) < 2;
  console.log(`[${viewport.name}] BUG 3 — matrix canvas fills viewport: ${canvasFills ? 'OK' : 'FAIL'}`);

  // Clear matrix so we can move on — flip the flag directly.
  await page.evaluate(() => {
    const blob = JSON.parse(localStorage.getItem('dhruv-stickers') || '{}');
    blob.matrixActive = false;
    localStorage.setItem('dhruv-stickers', JSON.stringify(blob));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('input[aria-label="Terminal Command Input"]', { timeout: 10000 });
  await measureAndShoot(page, `${viewport.name}-04-post-matrix-reload`);

  // ---- Bug 2a: disco coverage on mobile ----
  await page.click('input[aria-label="Terminal Command Input"]');
  await page.fill('input[aria-label="Terminal Command Input"]', 'sudo disco yes');
  await page.press('input[aria-label="Terminal Command Input"]', 'Enter');
  await page.waitForTimeout(1500);
  const discoMeasure = await measureAndShoot(page, `${viewport.name}-05-disco-active`);
  console.log(`[${viewport.name}] BUG 2a — data-disco set: ${discoMeasure.dataDisco === 'on' ? 'OK' : 'FAIL'}`);

  // ---- Bug 2c: mobile theme button shows disco ball ----
  const mobileThemeIcon = await page.evaluate(() => {
    // The mobile theme button lives in the mobile-only social pill. Its
    // aria-label changes to "Exit disco mode" when disco is active.
    const btn = document.querySelector('button[aria-label="Exit disco mode"]');
    if (!btn) return null;
    // SVG with text-fuchsia-500 = disco ball variant.
    const svg = btn.querySelector('svg');
    return {
      ariaLabel: btn.getAttribute('aria-label'),
      svgClass: svg ? svg.getAttribute('class') : null,
      hasDiscoBall: svg ? (svg.getAttribute('class') || '').includes('fuchsia') : false,
    };
  });
  console.log(`[${viewport.name}] BUG 2c — mobile theme button disco ball:`, JSON.stringify(mobileThemeIcon));

  // ---- Bug 2b: clicking mobile theme button exits disco ----
  // The desktop theme toggle also has aria-label="Exit disco mode" but it's
  // hidden by `hidden md:flex` utility classes on mobile viewports. We
  // therefore need to target the mobile-pill variant specifically. Use the
  // `.md:hidden` wrapper as the ancestor + the first visible match.
  const mobileThemeLocator = page.locator('div.md\\:hidden >> button[aria-label="Exit disco mode"]').first();
  await mobileThemeLocator.waitFor({ state: 'visible', timeout: 10000 });
  await mobileThemeLocator.click({ force: true });
  await page.waitForTimeout(500);
  const afterExit = await measureAndShoot(page, `${viewport.name}-06-after-mobile-theme-exit`);
  console.log(`[${viewport.name}] BUG 2b — data-disco cleared after mobile theme click: ${afterExit.dataDisco === null ? 'OK' : 'FAIL'}`);

  await context.close();
}

(async () => {
  console.log('Launching Chrome:', CHROME_PATH);
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    channel: 'chrome',
    headless: true,
  });
  try {
    for (const vp of VIEWPORTS) {
      try {
        await runOne(browser, vp);
      } catch (err) {
        console.error(`[${vp.name}] ERROR:`, err);
      }
    }
  } finally {
    await browser.close();
  }
})();
