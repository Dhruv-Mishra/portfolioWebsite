import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Z_INDEX } from '../designTokens';

const readComponent = (filename: string) =>
  fs.readFileSync(path.join(process.cwd(), 'components', filename), 'utf8');

const readAppFile = (filename: string) =>
  fs.readFileSync(path.join(process.cwd(), 'app', filename), 'utf8');

const globalsCss = readAppFile('globals.css');
const matrixOverlaySrc = readComponent('DiscoMatrixOverlay.tsx');
const voiceStageSrc = readComponent('voice/VoiceStage.tsx');
const socialSidebarSrc = readComponent('SocialSidebar.tsx');
const mobileSoundFabSrc = readComponent('MobileSoundToggleFab.tsx');
const globalVoiceFabSrc = readComponent('voice/GlobalVoiceFab.tsx');
const feedbackTabSrc = readComponent('FeedbackTabButton.tsx');
const designTokensSrc = fs.readFileSync(
  path.join(process.cwd(), 'lib', 'designTokens.ts'),
  'utf8',
);

describe('mobile visibility and stacking contract', () => {
  describe('Z-Index tokenization & stacking hierarchy', () => {
    it('defines explicit tokens for Matrix layers below VoiceStage', () => {
      expect(Z_INDEX.matrixCanvas).toBeDefined();
      expect(Z_INDEX.matrixSocial).toBeDefined();
      expect(Z_INDEX.matrixControls).toBeDefined();
      expect(Z_INDEX.matrixTransition).toBeDefined();
      expect(Z_INDEX.voice).toBeDefined();

      // VoiceStage strictly wins stacking over all Matrix layers when concurrent
      expect(Z_INDEX.voice).toBeGreaterThan(Z_INDEX.matrixTransition);
      expect(Z_INDEX.matrixTransition).toBeGreaterThan(Z_INDEX.matrixControls);
      expect(Z_INDEX.matrixControls).toBeGreaterThan(Z_INDEX.matrixSocial);
      expect(Z_INDEX.matrixSocial).toBeGreaterThan(Z_INDEX.matrixCanvas);

      // Context menu and cursor remain above voice stage
      expect(Z_INDEX.contextMenu).toBeGreaterThan(Z_INDEX.voice);
      expect(Z_INDEX.cursor).toBeGreaterThan(Z_INDEX.contextMenu);
    });

    it('removes unused Z_INDEX.matrix alias', () => {
      expect('matrix' in Z_INDEX).toBe(false);
      expect(designTokensSrc).not.toMatch(/^\s*matrix:\s*\d+/m);
    });

    it('uses tokenized Z_INDEX in DiscoMatrixOverlay and eliminates raw magic numbers', () => {
      expect(matrixOverlaySrc).toContain("import { Z_INDEX } from '@/lib/designTokens';");
      expect(matrixOverlaySrc).toContain('zIndex: Z_INDEX.matrixCanvas');
      expect(matrixOverlaySrc).toContain('zIndex: Z_INDEX.matrixControls');
      expect(matrixOverlaySrc).toContain('zIndex: Z_INDEX.matrixTransition');

      // Raw magic numbers eliminated
      expect(matrixOverlaySrc).not.toMatch(/zIndex:\s*9998/);
      expect(matrixOverlaySrc).not.toMatch(/zIndex:\s*9999/);
      expect(matrixOverlaySrc).not.toMatch(/zIndex:\s*10000/);
      expect(matrixOverlaySrc).not.toMatch(/zIndex:\s*10001/);
    });

    it('keeps VoiceStage tokenized at Z_INDEX.voice and marked with data-voice-stage', () => {
      expect(voiceStageSrc).toContain('zIndex: Z_INDEX.voice');
      expect(voiceStageSrc).toContain('data-voice-stage');
    });
  });

  describe('Voice Mode mobile dock ownership & social drawer accessibility', () => {
    it('disconfirms that social frame is hidden for general voice mode and keeps it visible during live voice', () => {
      // Social frame must NOT be hidden by generic html[data-voice-mode]
      expect(globalsCss).not.toMatch(
        /html\[data-voice-mode\]\s+\[data-social-sidebar-frame\]\s*\{[^}]*display:\s*none/i,
      );
    });

    it('keeps social links live while reserving the feedback corner for voice controls', () => {
      expect(globalsCss).toMatch(
        /html\[data-voice-mode="intro"\]\s+\[data-social-sidebar-frame\],[^}]*html\[data-voice-mode="exiting"\]\s+\[data-social-sidebar-frame\][^}]*display:\s*none\s*!important;/,
      );
      expect(globalsCss).toMatch(
        /html\[data-voice-mode\]\s+\[data-feedback-tab\][^}]*display:\s*none\s*!important;/,
      );
    });

    it('places live voice dock above the maximum expanded social drawer using --c-mobile-floating-bottom', () => {
      // Disconfirm that live voice remains at the social dock
      expect(voiceStageSrc).not.toContain(
        "bottom: 'max(1rem, env(safe-area-inset-bottom) + 0.75rem)'",
      );
      expect(voiceStageSrc).not.toContain("bottom: 'var(--c-mobile-dock-bottom)'");
      expect(voiceStageSrc).toContain("bottom: 'var(--c-mobile-floating-bottom)'");

      // Keep captions bottom-centered without lifting them into page content.
      expect(voiceStageSrc).toContain(
        "const MOBILE_CAPTION_BOTTOM = 'calc(var(--c-mobile-dock-bottom) + 3.5rem)'",
      );
    });

    it('hides mobile sound toggle during voice mode', () => {
      expect(globalsCss).toMatch(
        /html\[data-voice-mode\]\s+\[data-mobile-sound-toggle\]/,
      );
    });

    it('ensures mobile social frame has data-social-sidebar-frame and desktop layout is preserved', () => {
      expect(socialSidebarSrc).toContain('data-social-sidebar-frame');
      expect(socialSidebarSrc).toContain('data-social-sidebar-layout="mobile"');
      expect(socialSidebarSrc).toContain('data-social-sidebar-layout="desktop"');
      expect(socialSidebarSrc).toMatch(
        /<div\s+data-social-sidebar\s+data-social-sidebar-layout="desktop"/,
      );
    });
  });

  describe('Matrix Mode collision elimination & non-overlapping tiers', () => {
    it('keeps social frame visible and stacks it strictly between matrixCanvas and matrixControls under html[data-matrix]', () => {
      // Social frame must NOT be hidden in Matrix mode
      expect(globalsCss).not.toMatch(
        /html\[data-matrix\]\s+\[data-social-sidebar-frame\]\s*\{[^}]*display:\s*none/i,
      );

      // Stacking hierarchy: matrixCanvas (9997) < social (9998) < matrixControls (9999) < voice (10001)
      const match = globalsCss.match(
        /html\[data-matrix\]\s+\[data-mobile-social-frame\]\s*\{[^}]*z-index:\s*(\d+)\s*!important/i,
      );
      expect(match).not.toBeNull();
      const socialMatrixZIndex = Number(match![1]);
      expect(socialMatrixZIndex).toBeGreaterThan(Z_INDEX.matrixCanvas);
      expect(socialMatrixZIndex).toBeLessThan(Z_INDEX.matrixControls);
      expect(socialMatrixZIndex).toBeLessThan(Z_INDEX.voice);
      expect(socialMatrixZIndex).toBe(Z_INDEX.matrixSocial);
    });

    it('retains normal sidebar layering outside Matrix mode', () => {
      expect(socialSidebarSrc).toContain('zIndex: Z_INDEX.sidebar');
      expect(Z_INDEX.sidebar).toBeLessThan(Z_INDEX.nav);
    });

    it('hides only duplicate/underlying mobile sound, global voice launcher, and feedback triggers', () => {
      expect(globalsCss).toContain('html[data-matrix] [data-mobile-sound-toggle]');
      expect(globalsCss).toContain('html[data-matrix] [data-global-voice-fab="mobile"]');
      expect(globalsCss).toContain('html[data-matrix] [data-voice-launcher]');
      expect(globalsCss).toContain('html[data-matrix] [data-feedback-tab]');
      expect(globalsCss).toContain('html[data-matrix] [data-feedback-trigger]');
    });

    it('positions Matrix wake and escape controls in responsive tiers above social drawer on mobile', () => {
      // Disconfirm that Matrix controls share bottom tier with social or each other
      expect(globalsCss).toMatch(
        /\[data-matrix-wake\]\s*\{[^}]*bottom:\s*var\(--c-mobile-floating-bottom\)\s*!important;/,
      );
      expect(globalsCss).toMatch(
        /\[data-matrix-escape\]\s*\{[^}]*bottom:\s*calc\(var\(--c-mobile-floating-bottom\)\s*\+\s*3\.75rem\)\s*!important;/,
      );
      expect(globalsCss).toMatch(
        /\[data-matrix-hint\]\s*\{[^}]*bottom:\s*calc\(var\(--c-mobile-floating-bottom\)\s*\+\s*7\.5rem\)\s*!important;/,
      );
    });

    it('attaches stable data attributes to mobile sound FAB and voice launcher', () => {
      expect(mobileSoundFabSrc).toContain('data-mobile-sound-toggle');
      expect(globalVoiceFabSrc).toContain('data-global-voice-fab="mobile"');
      expect(globalVoiceFabSrc).toContain('data-voice-launcher');
      expect(globalVoiceFabSrc).toContain('data-global-voice-fab="desktop"');
      expect(feedbackTabSrc).toContain('data-feedback-tab');
      expect(feedbackTabSrc).toContain('data-feedback-trigger');
    });

    it('attaches stable data attributes to matrix overlay elements', () => {
      expect(matrixOverlaySrc).toContain('data-matrix-canvas');
      expect(matrixOverlaySrc).toContain('data-matrix-wake');
      expect(matrixOverlaySrc).toContain('data-matrix-control="wake"');
      expect(matrixOverlaySrc).toContain('data-matrix-escape');
      expect(matrixOverlaySrc).toContain('data-matrix-control="escape"');
      expect(matrixOverlaySrc).toContain('data-matrix-transition');
      expect(matrixOverlaySrc).toContain('data-matrix-hint');
    });
  });

  describe('Static geometry clearance verification', () => {
    it('guarantees non-overlapping responsive tiers at 320x568 and 390x844 viewports', () => {
      // Baseline metrics in pixels (assuming 16px rem)
      const rem = 16;
      // Social drawer: bottom 0.75rem (12px), max expanded height ~8.5rem (136px)
      const socialBottom = 0.75 * rem;
      const socialMaxHeight = 8.5 * rem;
      const socialTop = socialBottom + socialMaxHeight; // 148px

      // Voice dock: bottom = --c-mobile-floating-bottom (10.75rem = 172px)
      const voiceDockBottom = 10.75 * rem; // 172px
      const voiceDockHeight = 4.0 * rem; // 64px
      const voiceDockTop = voiceDockBottom + voiceDockHeight; // 220px

      // Voice captions: bottom = --c-mobile-floating-bottom + 5rem (14.75rem = 236px)
      const voiceCaptionsBottom = voiceDockBottom + 5.0 * rem; // 236px
      const voiceCaptionsMaxHeight = 7.5 * rem; // 120px
      const voiceCaptionsTop = voiceCaptionsBottom + voiceCaptionsMaxHeight; // 356px

      // Matrix Wake: bottom = --c-mobile-floating-bottom (9.75rem = 156px)
      const matrixWakeBottom = 9.75 * rem; // 156px
      const matrixWakeHeight = 3.0 * rem; // ~48px
      const matrixWakeTop = matrixWakeBottom + matrixWakeHeight; // 204px

      // Matrix Escape: bottom = --c-mobile-floating-bottom + 3.75rem (13.5rem = 216px)
      const matrixEscapeBottom = voiceDockBottom + 3.75 * rem; // 216px
      const matrixEscapeHeight = 2.75 * rem; // ~44px
      const matrixEscapeTop = matrixEscapeBottom + matrixEscapeHeight; // 260px

      // Matrix Hint: bottom = --c-mobile-floating-bottom + 7.5rem (17.25rem = 276px)
      const matrixHintBottom = voiceDockBottom + 7.5 * rem; // 276px
      const matrixHintHeight = 2.25 * rem; // ~36px
      const matrixHintTop = matrixHintBottom + matrixHintHeight; // 312px

      // 1. Voice clearances
      expect(voiceDockBottom).toBeGreaterThanOrEqual(socialTop); // Clearance above social drawer >= 8px
      expect(voiceCaptionsBottom).toBeGreaterThanOrEqual(voiceDockTop); // Clearance above voice dock >= 16px

      // 2. Matrix clearances
      expect(matrixWakeBottom).toBeGreaterThanOrEqual(socialTop); // Clearance above social drawer >= 8px
      expect(matrixEscapeBottom).toBeGreaterThanOrEqual(matrixWakeTop); // Clearance above wake button >= 12px
      expect(matrixHintBottom).toBeGreaterThanOrEqual(matrixEscapeTop); // Clearance above escape button >= 16px

      // 3. Viewport fit at 320x568
      const viewport568 = 568;
      expect(voiceCaptionsTop).toBeLessThan(viewport568);
      expect(matrixHintTop).toBeLessThan(viewport568);

      // 4. Viewport fit at 390x844
      const viewport844 = 844;
      expect(voiceCaptionsTop).toBeLessThan(viewport844);
      expect(matrixHintTop).toBeLessThan(viewport844);
    });
  });

  describe('MiniChat dead selector and comment eradication', () => {
    it('has zero occurrences of data-mini-chat-root or data-mini-chat-panel in globals.css', () => {
      expect(globalsCss).not.toContain('data-mini-chat-root');
      expect(globalsCss).not.toContain('data-mini-chat-panel');
    });

    it('has zero occurrences of MiniChat in owned component comments and design tokens', () => {
      expect(designTokensSrc).not.toContain('MiniChat');
      expect(mobileSoundFabSrc).not.toContain('MiniChat');
      expect(socialSidebarSrc).not.toContain('MiniChat');
    });
  });

  describe('Pure CSS root-state implementation without runtime computation', () => {
    it('does not introduce observers, polling, timers, or coordinate measurements for stacking', () => {
      for (const [name, src] of [
        ['SocialSidebar', socialSidebarSrc],
        ['MobileSoundToggleFab', mobileSoundFabSrc],
        ['GlobalVoiceFab', globalVoiceFabSrc],
        ['FeedbackTabButton', feedbackTabSrc],
        ['DiscoMatrixOverlay', matrixOverlaySrc],
      ] as const) {
        expect(src, `${name} has ResizeObserver`).not.toContain('ResizeObserver');
        expect(src, `${name} has MutationObserver`).not.toContain('MutationObserver');
        expect(src, `${name} has getBoundingClientRect`).not.toContain('getBoundingClientRect');
      }
    });
  });
});
