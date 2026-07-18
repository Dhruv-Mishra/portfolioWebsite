import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const componentSource = (filename: string) => fs.readFileSync(
  path.join(process.cwd(), 'components', filename),
  'utf8',
);

const miniChatSource = componentSource('MiniChat.tsx');
const panelSource = componentSource('MiniChatPanel.tsx');
const stickyChatSource = componentSource('StickyNoteChat.tsx');
const listeningOverlaySource = componentSource(path.join('ui', 'ListeningOverlay.tsx'));
const globalStyles = fs.readFileSync(path.join(process.cwd(), 'app', 'globals.css'), 'utf8');

describe('quick chat small-mobile density contract', () => {
  it('tightens the panel only at the narrow mobile breakpoint while honoring size preference tokens', () => {
    expect(globalStyles).toContain('@media (max-width: 480px)');
    expect(globalStyles).toContain('--c-quick-chat-mobile-h: min(var(--c-chat-h), 66dvh);');
    expect(panelSource).toContain('max-[480px]:h-[var(--c-quick-chat-mobile-h)]');
    expect(panelSource).toContain('max-[480px]:px-3');
    expect(panelSource).toContain('max-[480px]:text-lg');
  });

  it('keeps quick-chat touch controls at 44px while reducing their visual glyphs', () => {
    expect(miniChatSource).toContain('h-[max(var(--c-fab-size),44px)]');
    expect(panelSource).toContain('h-11 w-11');
    expect(stickyChatSource).toContain('inline-flex h-11 w-11 shrink-0 items-center justify-center');
    expect(miniChatSource).toContain('max-[480px]:scale-[0.84]');
    expect(panelSource).toContain('max-[480px]:h-3 max-[480px]:w-3');
    expect(stickyChatSource).toContain('max-[480px]:h-3 max-[480px]:w-3');
  });

  it('compacts suggestion and transcription surfaces at 480px without removing readable labels', () => {
    expect(stickyChatSource).toContain('min-h-11 px-4 py-2 max-[480px]:px-3 max-[480px]:py-1.5');
    expect(stickyChatSource).toContain('max-[480px]:text-[13px]');
    expect(stickyChatSource).toContain('max-[480px]:gap-1.5');
    expect(listeningOverlaySource).toContain('max-[480px]:h-6');
    expect(listeningOverlaySource).toContain('max-[480px]:text-[9px]');
  });
});