import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  path.join(process.cwd(), 'components', 'SettingsPanel.tsx'),
  'utf8',
);

describe('settings chat model contract', () => {
  it('renders every catalog model under its catalog groups with selected-model capabilities', () => {
    expect(source).toContain('title="AI model" icon={Bot}');
    expect(source).toContain("['Recommended', 'NVIDIA']");
    expect(source).toContain('CHAT_MODELS.filter((model) => model.group === group)');
    expect(source).toContain("selectedModel.supportsImages ? 'Vision' : 'Text'");
    expect(source).toContain('selectedModel.quality');
    expect(source).toContain('selectedModel.caveat');
  });

  it('requires a safe, focused confirmation when persisted chat would be cleared', () => {
    expect(source).toContain('hasPersistedChatMessages()');
    expect(source).toContain('ariaLabelledBy="chat-model-switch-title"');
    expect(source).toContain('Switch and clear chat');
    expect(source).toContain('clearChatHistoryStorage();');
    expect(source).toContain('dispatchChatModelSwitchClear();');
    expect(source).toContain('ref={modelCancelRef}');
  });
});