/**
 * Empirical Disco Mode perf + bug verification harness.
 *
 * Uses playwright-core with system Chrome to:
 *   1. Boot a browser, navigate to the Next.js dev server on port 3000.
 *   2. Seed localStorage with a superuser unlock so `sudo disco` works.
 *   3. Activate disco via the terminal `sudo disco` command (full stack mount).
 *   4. Verify disco is actually active (data-disco="on" attribute).
 *   5. Screenshot the hero area.
 *   6. Run a 5-second rAF FPS counter on home + /projects and on /projects
 *      with continuous scrolling.
 *   7. Emulate a mobile viewport + CPU throttle for the mobile FPS pass.
 *   8. Capture a memory snapshot (performance.memory) at start + at 60s.
 *   9. Inspect computed styles of the hero subtitle in disco.
 *
 * Arguments:
 *   --output-dir  <path>  Where to write screenshots + the JSON report
 *                         (default: `./tmp/disco-profile/<timestamp>`)
 *   --tag         <name>  Optional tag to prefix output filenames (e.g., "before" / "after")
 *   --fast                 Skip the 60s memory check (faster iteration)
 *
 * Requires `playwright-core` (install via `npm i --no-save playwright-core`)
 * and a local Chrome/Chromium binary (auto-detected).
 */

import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
function argAt(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}
const tag = argAt('--tag') ?? 'run';
const fast = args.includes('--fast');
const outDir = argAt('--output-dir') ?? path.resolve('tmp/disco-profile', String(Date.now()));
fs.mkdirSync(outDir, { recursive: true });

const chromeCandidates = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe` : null,
].filter(Boolean);
const executablePath = chromeCandidates.find((p) => fs.existsSync(p));
if (!executablePath) {
  console.error('No Chrome binary found. Tried:', chromeCandidates);
  process.exit(1);
}

const BASE = 'http://localhost:3000';
const results = { tag, outDir, scenarios: [] };

async function seedAndReload(page) {
  await page.evaluate(() => {
    const payload = {
      version: 3,
      unlocked: ['superuser'],
      unlockedAt: { superuser: Date.now() },
      lastEarnedAt: Date.now(),
      lastSeenAlbumAt: Date.now(),
      visitedRoutes: [],
      terminalCommands: [],
      openedProjects: [],
      discoMuted: true,
    };
    localStorage.setItem('dhruv-stickers', JSON.stringify(payload));
  });
  await page.reload({ waitUntil: 'networkidle' });
  // Allow client hydration + dynamic imports to settle.
  await page.waitForTimeout(1200);
}

async function activateDiscoViaTerminal(page, { strictVerify = true } = {}) {
  // Wait for the terminal input to exist. On mobile it's below the fold but
  // still in the DOM — just not focused.
  let input;
  try {
    input = await page.waitForSelector('input[aria-label="Terminal Command Input"]', {
      timeout: 5000,
      state: 'attached',
    });
  } catch {
    console.warn('Terminal input not found; aborting activation.');
    return false;
  }
  await input.scrollIntoViewIfNeeded().catch(() => {});
  await input.focus();
  // Type the command character-by-character.
  await page.keyboard.type('sudo disco', { delay: 15 });
  await page.keyboard.press('Enter');
  // Wait for the disco attribute.
  try {
    await page.waitForFunction(() => document.documentElement.dataset.disco === 'on', {
      timeout: 5000,
    });
  } catch {
    if (strictVerify) {
      console.warn('[activateDiscoViaTerminal] data-disco=on not observed within 5s.');
      return false;
    }
  }
  // Allow heavy media layer chunk to fetch + mount.
  await page.waitForTimeout(2000);
  return true;
}

async function measureFps(page, durationMs, scrollDuringMeasure = false) {
  return await page.evaluate(
    ({ durationMs, scrollDuringMeasure }) => {
      return new Promise((resolve) => {
        let frames = 0;
        let scrollTickId = null;
        if (scrollDuringMeasure) {
          let direction = 1;
          scrollTickId = setInterval(() => {
            window.scrollBy(0, direction * 40);
            if (window.scrollY + window.innerHeight >= document.body.scrollHeight - 4) direction = -1;
            if (window.scrollY <= 4) direction = 1;
          }, 33);
        }
        const start = performance.now();
        function tick() {
          frames++;
          const elapsed = performance.now() - start;
          if (elapsed < durationMs) {
            requestAnimationFrame(tick);
          } else {
            if (scrollTickId) clearInterval(scrollTickId);
            resolve({ fps: +(frames / (elapsed / 1000)).toFixed(1), elapsedMs: +elapsed.toFixed(0), frames });
          }
        }
        requestAnimationFrame(tick);
      });
    },
    { durationMs, scrollDuringMeasure },
  );
}

async function memoryUsageMb(page) {
  return await page.evaluate(() => {
    const m = performance.memory;
    if (!m) return { supported: false };
    return {
      supported: true,
      usedJSHeapSizeMB: +(m.usedJSHeapSize / 1024 / 1024).toFixed(2),
      totalJSHeapSizeMB: +(m.totalJSHeapSize / 1024 / 1024).toFixed(2),
      jsHeapSizeLimitMB: +(m.jsHeapSizeLimit / 1024 / 1024).toFixed(2),
    };
  });
}

async function computedStyleSnapshot(page, selector, props) {
  return await page.evaluate(
    ({ selector, props }) => {
      const el = document.querySelector(selector);
      if (!el) return { found: false };
      const cs = getComputedStyle(el);
      const snap = { found: true, tagName: el.tagName, text: el.textContent?.slice(0, 120) ?? '' };
      for (const p of props) snap[p] = cs.getPropertyValue(p);
      return snap;
    },
    { selector, props },
  );
}

async function discoAttributes(page) {
  return await page.evaluate(() => ({
    disco: document.documentElement.dataset.disco ?? null,
    bodyBg: getComputedStyle(document.body).getPropertyValue('background-image').slice(0, 120),
    spotlights: !!document.querySelector('.disco-spotlights'),
    sparkles: !!document.querySelector('.disco-sparkle-canvas'),
  }));
}

async function run() {
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox'],
  });

  // =========================================================
  // DESKTOP — viewport 1440x900
  // =========================================================
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
  });
  const page = await desktop.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await seedAndReload(page);
  const activated = await activateDiscoViaTerminal(page);
  const attrs = await discoAttributes(page);
  results.activationCheck = { activated, attrs };

  // --- Bug 1: hero subtitle computed style + screenshot ---
  const heroSubtitleStyle = await computedStyleSnapshot(page, 'p.animate-hero-subtitle', [
    'color',
    'opacity',
    'animation-name',
    '-webkit-text-fill-color',
    'visibility',
    'display',
    'z-index',
    'background-clip',
    '-webkit-background-clip',
    'mix-blend-mode',
  ]);
  results.heroSubtitleDesktop = heroSubtitleStyle;

  // Scroll the hero into view before the screenshot so we capture it.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const heroShotPath = path.join(outDir, `${tag}-hero-disco-desktop.png`);
  await page.screenshot({
    path: heroShotPath,
    clip: { x: 0, y: 0, width: 1440, height: 900 },
  });

  // --- Bug 2 Scenario 1: Home + disco, steady-state FPS ---
  const memStart = await memoryUsageMb(page);
  const homeFps = await measureFps(page, 5000, false);
  const memAfterHome = await memoryUsageMb(page);
  results.scenarios.push({
    name: 'desktop-home-steady',
    viewport: '1440x900',
    ...homeFps,
    memoryBefore: memStart,
    memoryAfter: memAfterHome,
  });

  // --- Navigate to /projects via client-side link to preserve disco state ---
  // A full page reload resets the sticker store's `discoActive` flag (it's
  // session-only / not persisted). Using the Next.js <Link> (anchor) inside
  // the main nav keeps the JS module singleton alive, so disco stays on.
  const projLink = await page.$('nav[aria-label="Main navigation"] a[href="/projects"]');
  if (projLink) {
    await projLink.click();
    await page.waitForURL(`${BASE}/projects`, { timeout: 5000 }).catch(() => {});
  } else {
    console.warn('Projects nav link not found; falling back to page.goto (disco may reset).');
    await page.goto(`${BASE}/projects`, { waitUntil: 'networkidle' });
  }
  await page.waitForTimeout(1500);
  const attrsProjects = await discoAttributes(page);
  const projectsFps = await measureFps(page, 5000, false);
  const memAfterProjects = await memoryUsageMb(page);
  results.scenarios.push({
    name: 'desktop-projects-steady',
    viewport: '1440x900',
    discoStateAfterNav: attrsProjects,
    ...projectsFps,
    memoryAfter: memAfterProjects,
  });

  // --- Projects + continuous scroll ---
  const projectsScrollFps = await measureFps(page, 5000, true);
  results.scenarios.push({ name: 'desktop-projects-scroll', viewport: '1440x900', ...projectsScrollFps });

  // Screenshot of projects in disco for visual verification.
  const projShot = path.join(outDir, `${tag}-projects-disco-desktop.png`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: projShot, clip: { x: 0, y: 0, width: 1440, height: 900 } });
  results.projectsScreenshot = projShot;

  await page.close();
  await desktop.close();

  // =========================================================
  // MOBILE — iPhone 12 Pro-ish viewport, 4x CPU throttle
  // =========================================================
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  });
  const mpage = await mobile.newPage();
  const mcdp = await mpage.context().newCDPSession(mpage);
  try {
    await mcdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  } catch (e) {
    console.warn('CPU throttle skipped:', e.message);
  }
  await mpage.goto(BASE, { waitUntil: 'networkidle' });
  await seedAndReload(mpage);
  await activateDiscoViaTerminal(mpage);
  const mattrs = await discoAttributes(mpage);
  results.mobileActivationCheck = mattrs;

  const mheroStyle = await computedStyleSnapshot(mpage, 'p.animate-hero-subtitle', [
    'color',
    'opacity',
    'animation-name',
    '-webkit-text-fill-color',
  ]);
  results.heroSubtitleMobile = mheroStyle;

  await mpage.evaluate(() => window.scrollTo(0, 0));
  await mpage.waitForTimeout(300);
  const mheroShotPath = path.join(outDir, `${tag}-hero-disco-mobile.png`);
  await mpage.screenshot({ path: mheroShotPath });

  const mFps = await measureFps(mpage, 5000, false);
  results.scenarios.push({ name: 'mobile-home-steady', viewport: '390x844 (4x CPU)', ...mFps });

  // Client-side nav on mobile: the nav menu may be collapsed behind a
  // hamburger on 390px. Fall back to programmatic link click or page.goto.
  const mprojLink = await mpage.$('nav[aria-label="Main navigation"] a[href="/projects"]');
  if (mprojLink) {
    await mprojLink.click({ force: true });
    await mpage.waitForURL(`${BASE}/projects`, { timeout: 5000 }).catch(() => {});
  } else {
    await mpage.goto(`${BASE}/projects`, { waitUntil: 'networkidle' });
  }
  await mpage.waitForTimeout(1500);
  const mAttrProjects = await discoAttributes(mpage);
  const mProjectsFps = await measureFps(mpage, 5000, false);
  results.scenarios.push({
    name: 'mobile-projects-steady',
    viewport: '390x844 (4x CPU)',
    discoStateAfterNav: mAttrProjects,
    ...mProjectsFps,
  });

  await mpage.close();
  await mobile.close();

  // =========================================================
  // MEMORY OVER 60s — desktop (optional for --fast iterations)
  // =========================================================
  if (!fast) {
    const mem60 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const mp = await mem60.newPage();
    await mp.goto(BASE, { waitUntil: 'networkidle' });
    await seedAndReload(mp);
    await activateDiscoViaTerminal(mp);
    await mp.waitForTimeout(2000);
    const memT0 = await memoryUsageMb(mp);
    await mp.waitForTimeout(60000);
    const memT60 = await memoryUsageMb(mp);
    results.memoryOver60s = { t0: memT0, t60: memT60 };
    await mp.close();
    await mem60.close();
  }

  results.heroScreenshots = { desktop: heroShotPath, mobile: results.mobileActivationCheck ? path.join(outDir, `${tag}-hero-disco-mobile.png`) : null };

  await browser.close();

  const jsonPath = path.join(outDir, `${tag}-report.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  console.log('\n=== Disco profile report ===');
  console.log(JSON.stringify(results, null, 2));
  console.log('\nSaved:', jsonPath);
}

run().catch((err) => {
  console.error('Profile run failed:', err);
  process.exit(1);
});
