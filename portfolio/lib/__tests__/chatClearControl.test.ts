import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  path.join(process.cwd(), 'components', 'StickyNoteChat.tsx'),
  'utf8',
);

describe('chat clear control', () => {
  it('uses an accessible trash sprite without changing the confirmation flow', () => {
    const start = source.indexOf('{hasMessages && (');
    const end = source.indexOf('{speech.isSupported && (', start);
    const clearControl = source.slice(start, end);

    expect(clearControl).toContain('<Tooltip label="Clear chat history">');
    expect(clearControl).toContain("onClick={() => setConfirmKind('clear')}");
    expect(clearControl).toContain('aria-label="Clear chat history"');
    expect(clearControl).toContain('title="Clear chat history"');
    expect(clearControl).toContain('h-11 w-11');
    expect(clearControl).toContain('<Trash2 size={14} aria-hidden="true" />');
    expect(clearControl).not.toMatch(/>\s*Clear chat\s*</);
  });

  it('retains the existing clear-chat behavior', () => {
    expect(source).toMatch(/const handleClearDesk = useCallback\([\s\S]*?clearMessages\(\)/);
  });
});