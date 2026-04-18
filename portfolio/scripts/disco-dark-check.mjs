/**
 * Quick extra verification — hero subtitle under DARK disco (jewel-tone
 * gradient) and LIGHT disco (candy-pastel gradient) on both desktop and mobile.
 * Confirms the fix works under all four combinations.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('tmp/disco-profile', 'dark-check');
fs.mkdirSync(outDir, { recursive: true });
const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:3000';

async function runCase(browser, { viewport, isMobile, dark, tag }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: isMobile ? 3 : 1, hasTouch: isMobile, isMobile });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });

  // Seed superuser.
  await page.evaluate((isDark) => {
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
    // Set theme choice. next-themes uses the key "theme".
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, dark);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // Activate disco via terminal.
  const input = await page.waitForSelector('input[aria-label="Terminal Command Input"]', { timeout: 5000 });
  await input.scrollIntoViewIfNeeded().catch(() => {});
  await input.focus();
  await page.keyboard.type('sudo disco', { delay: 15 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.documentElement.dataset.disco === 'on', { timeout: 5000 });
  await page.waitForTimeout(2000);

  // Scroll to top, screenshot hero.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  const shotPath = path.join(outDir, `${tag}.png`);
  await page.screenshot({ path: shotPath });

  // Computed style.
  const subtitle = await page.evaluate(() => {
    const el = document.querySelector('p.animate-hero-subtitle');
    if (!el) return { found: false };
    const cs = getComputedStyle(el);
    return {
      found: true,
      opacity: cs.getPropertyValue('opacity'),
      color: cs.getPropertyValue('color'),
      animationName: cs.getPropertyValue('animation-name'),
      textContent: el.textContent?.slice(0, 80) ?? '',
    };
  });
  const theme = await page.evaluate(() => ({
    discoAttr: document.documentElement.dataset.disco ?? null,
    darkClass: document.documentElement.classList.contains('dark'),
  }));

  await page.close();
  await ctx.close();
  return { tag, theme, subtitle, screenshot: shotPath };
}

async function main() {
  const browser = await chromium.launch({ executablePath: chromePath, headless: true, args: ['--no-sandbox'] });
  const cases = [
    { viewport: { width: 1440, height: 900 }, isMobile: false, dark: false, tag: 'desktop-light-disco' },
    { viewport: { width: 1440, height: 900 }, isMobile: false, dark: true, tag: 'desktop-dark-disco' },
    { viewport: { width: 390, height: 844 }, isMobile: true, dark: false, tag: 'mobile-light-disco' },
    { viewport: { width: 390, height: 844 }, isMobile: true, dark: true, tag: 'mobile-dark-disco' },
  ];
  const results = [];
  for (const c of cases) {
    const r = await runCase(browser, c);
    results.push(r);
    console.log(`[${c.tag}] opacity=${r.subtitle.opacity}, dark=${r.theme.darkClass}, disco=${r.theme.discoAttr}, screenshot=${r.screenshot}`);
  }
  await browser.close();
  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
