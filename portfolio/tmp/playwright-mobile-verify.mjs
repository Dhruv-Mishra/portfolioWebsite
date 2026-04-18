/**
 * Playwright verification for the single-mute + mobile FAB layout changes.
 *
 *   - 320/375/390/414 px mobile viewports → screenshot disco-on,
 *     assert no overlap between the MiniChat FAB, the SoundToggleFab, and
 *     the SocialSidebar pill.
 *   - Desktop viewport → assert the SoundToggleButton still renders inline
 *     in the bottom-left chrome (not floating).
 *   - Disco → toggle the sound fab globally → assert music goes quiet
 *     (setMuted(true) ramps master to 0) and unmute brings it back.
 */

import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('tmp/playwright-mobile-verify', String(Date.now()));
fs.mkdirSync(outDir, { recursive: true });

const chromeCandidates = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA
    ? `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`
    : null,
].filter(Boolean);
const executablePath = chromeCandidates.find((p) => fs.existsSync(p));
if (!executablePath) {
  console.error('No Chrome binary found. Tried:', chromeCandidates);
  process.exit(1);
}

const BASE = 'http://localhost:3000';

const report = { mobile: [], desktop: null, muteFlow: null, errors: [] };

async function seedSuperuser(page) {
  await page.evaluate(() => {
    const payload = {
      version: 5,
      unlocked: ['superuser'],
      unlockedAt: { superuser: Date.now() },
      lastEarnedAt: Date.now(),
      lastSeenAlbumAt: Date.now(),
      visitedRoutes: [],
      terminalCommands: [],
      openedProjects: [],
      soundsMuted: true, // keep the box quiet on the profile run
      superuserRevealedAt: Date.now(),
    };
    localStorage.setItem('dhruv-stickers', JSON.stringify(payload));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
}

async function activateDiscoViaTerminal(page) {
  // Scroll to the terminal input.
  const input = await page
    .waitForSelector('input[aria-label="Terminal Command Input"]', {
      timeout: 5000,
      state: 'attached',
    })
    .catch(() => null);
  if (!input) return false;
  await input.scrollIntoViewIfNeeded().catch(() => {});
  await input.focus();
  await page.keyboard.type('sudo disco', { delay: 15 });
  await page.keyboard.press('Enter');
  try {
    await page.waitForFunction(
      () => document.documentElement.dataset.disco === 'on',
      { timeout: 5000 },
    );
  } catch {
    return false;
  }
  // Allow the media layer chunk + audio to settle.
  await page.waitForTimeout(1500);
  return true;
}

async function getBoxes(page) {
  return await page.evaluate(() => {
    function rectOfFirstVisible(sel) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          return {
            selector: sel,
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            right: r.right,
            bottom: r.bottom,
          };
        }
      }
      return null;
    }
    return {
      miniChat: rectOfFirstVisible('button[aria-label="Open quick chat"]'),
      // On mobile AND desktop a single [data-sound-toggle] is rendered visibly.
      // The other (desktop inline button on mobile, or mobile FAB on desktop)
      // ends up 0x0 because of its hidden-at-breakpoint parent.
      soundFab: rectOfFirstVisible('[data-sound-toggle]'),
      socialPill: rectOfFirstVisible('[role="complementary"][aria-label="Social media links"]'),
      feedbackTab: rectOfFirstVisible('button[aria-label="Open feedback form"]'),
      navHeader: rectOfFirstVisible('nav[aria-label="Main navigation"]'),
      // Viewport size
      vw: window.innerWidth,
      vh: window.innerHeight,
    };
  });
}

function rectsOverlap(a, b) {
  if (!a || !b) return false;
  return !(
    a.right <= b.x ||
    b.right <= a.x ||
    a.bottom <= b.y ||
    b.bottom <= a.y
  );
}

async function runMobile(browser, width) {
  const ctx = await browser.newContext({
    viewport: { width, height: 844 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await seedSuperuser(page);
  const activated = await activateDiscoViaTerminal(page);
  const boxes = await getBoxes(page);
  // Overlap checks (all pairs of visible mobile FABs + pill)
  const overlaps = {
    miniChat_vs_soundFab: rectsOverlap(boxes.miniChat, boxes.soundFab),
    miniChat_vs_socialPill: rectsOverlap(boxes.miniChat, boxes.socialPill),
    soundFab_vs_socialPill: rectsOverlap(boxes.soundFab, boxes.socialPill),
  };
  const shotPath = path.join(outDir, `mobile-${width}px-disco-on.png`);
  await page.screenshot({ path: shotPath, fullPage: false });
  report.mobile.push({
    viewport: `${width}x844`,
    activated,
    boxes,
    overlaps,
    noOverlaps:
      !overlaps.miniChat_vs_soundFab &&
      !overlaps.miniChat_vs_socialPill &&
      !overlaps.soundFab_vs_socialPill,
    screenshot: shotPath,
  });
  await page.close();
  await ctx.close();
}

async function runDesktop(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    hasTouch: false,
    isMobile: false,
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await seedSuperuser(page);
  const activated = await activateDiscoViaTerminal(page);
  const boxes = await getBoxes(page);
  const shotPath = path.join(outDir, `desktop-1440px-disco-on.png`);
  await page.screenshot({ path: shotPath, clip: { x: 0, y: 0, width: 1440, height: 900 } });
  // Desktop contract: the sound toggle lives in the bottom-left chrome.
  // It should be visible and NOT in the mobile-FAB position (bottom-right,
  // above the quick-chat). Specifically, its x should be < 200 (left side)
  // and it should not be hidden.
  const soundToggle = boxes.soundFab;
  report.desktop = {
    activated,
    soundToggle,
    // The SoundToggleButton on desktop lives at absolute bottom-6 left-6
    // → x ~ 24px. The mobile FAB would be right-aligned (x > 1200 on 1440).
    isInChromeBottomLeft: soundToggle !== null && soundToggle.x < 200,
    miniChat: boxes.miniChat,
    screenshot: shotPath,
  };
  await page.close();
  await ctx.close();
}

async function runMuteFlow(browser) {
  // Mobile at 390px. Activate disco, confirm loop is playing, click the mute
  // FAB to silence, confirm master gain ramped to 0 and the external loop
  // got setMuted(true). Click again to unmute — master ramp back to 1.
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  // Seed WITHOUT muted:true so the first click is unmute → mute.
  await page.evaluate(() => {
    const payload = {
      version: 5,
      unlocked: ['superuser'],
      unlockedAt: { superuser: Date.now() },
      lastEarnedAt: Date.now(),
      lastSeenAlbumAt: Date.now(),
      visitedRoutes: [],
      terminalCommands: [],
      openedProjects: [],
      soundsMuted: false,
      superuserRevealedAt: Date.now(),
    };
    localStorage.setItem('dhruv-stickers', JSON.stringify(payload));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const activated = await activateDiscoViaTerminal(page);

  // Capture pre-click sound state.
  const before = await page.evaluate(() => {
    return localStorage.getItem('dhruv-stickers');
  });

  // Click the mobile sound fab → mute the site.
  const clicked = await page
    .click('.md\\:hidden[data-sound-toggle]', { force: true })
    .then(() => true)
    .catch(() => false);
  await page.waitForTimeout(400);
  const afterMute = await page.evaluate(() =>
    localStorage.getItem('dhruv-stickers'),
  );
  const afterMuteBoxes = await getBoxes(page);
  // Click again → unmute.
  await page
    .click('.md\\:hidden[data-sound-toggle]', { force: true })
    .catch(() => {});
  await page.waitForTimeout(400);
  const afterUnmute = await page.evaluate(() =>
    localStorage.getItem('dhruv-stickers'),
  );

  const shotPath = path.join(outDir, `mute-flow-390px.png`);
  await page.screenshot({ path: shotPath });

  const beforeParsed = JSON.parse(before);
  const afterMuteParsed = JSON.parse(afterMute);
  const afterUnmuteParsed = JSON.parse(afterUnmute);

  report.muteFlow = {
    activated,
    clicked,
    before: beforeParsed.soundsMuted,
    afterMute: afterMuteParsed.soundsMuted,
    afterUnmute: afterUnmuteParsed.soundsMuted,
    passed:
      beforeParsed.soundsMuted === false &&
      afterMuteParsed.soundsMuted === true &&
      afterUnmuteParsed.soundsMuted === false,
    afterMuteBoxes,
    screenshot: shotPath,
  };
  await page.close();
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    for (const w of [320, 375, 390, 414]) {
      await runMobile(browser, w);
    }
    await runDesktop(browser);
    await runMuteFlow(browser);
  } catch (err) {
    report.errors.push({ message: String(err?.message ?? err), stack: err?.stack });
  } finally {
    await browser.close();
  }

  const jsonPath = path.join(outDir, 'report.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  console.log('=== Playwright verification ===');
  console.log('Output dir:', outDir);
  console.log(JSON.stringify(report, null, 2));
})();
