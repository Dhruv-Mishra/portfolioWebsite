import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  path.join(process.cwd(), 'components', 'StickyNoteChat.tsx'),
  'utf8',
);

describe('sticky note chat image attachment contract', () => {
  it('only exposes attachment controls for image-capable models and keeps selection accessible', () => {
    expect(source).toContain('const supportsImages = modelPrefHydrated && (model?.supportsImages ?? false)');
    expect(source).toContain('{supportsImages ? (');
    expect(source).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(source).toContain('aria-label="Attach image"');
    expect(source).toContain('aria-label="Choose image to attach"');
    expect(source).toContain('isCompressingImage');
  });

  it('shows transient previews and clears them after accepted sends or model switches', () => {
    expect(source).toContain('Image attached');
    expect(source).toContain('setAttachment(null);');
    expect(source).toContain('CHAT_MODEL_SWITCH_CLEAR_EVENT');
    expect(source).toContain('CHAT_MODEL_PREF_STORAGE_KEY');
    expect(source).toContain('imageCompressionGenerationRef.current += 1;');
    expect(source).toContain('if (!image && sendHardcoded');
  });

  it('aborts image preparation when a newer selection, model switch, or unmount supersedes it', () => {
    expect(source).toContain('const imageCompressionAbortRef = useRef<AbortController | null>(null);');
    expect(source).toContain("imageCompressionAbortRef.current?.abort('superseded');");
    expect(source).toContain("imageCompressionAbortRef.current?.abort('model-switch');");
    expect(source).toContain("imageCompressionAbortRef.current?.abort('unmount');");
    expect(source).toContain('compressChatImage(file, controller.signal)');
  });
});