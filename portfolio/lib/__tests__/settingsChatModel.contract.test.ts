import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHAT_MODEL_CAPABILITIES, CHAT_MODELS } from '@/lib/chatModels';

const source = fs.readFileSync(
  path.join(process.cwd(), 'components', 'SettingsPanel.tsx'),
  'utf8',
);
const chatSource = fs.readFileSync(
  path.join(process.cwd(), 'components', 'StickyNoteChat.tsx'),
  'utf8',
);
const statusSource = fs.readFileSync(
  path.join(process.cwd(), 'lib', 'chatModelStatus.ts'),
  'utf8',
);

describe('settings chat model contract', () => {
  it('renders every catalog model under its catalog groups with selected-model capabilities', () => {
    expect(source).toMatch(/<SettingsGroup[\s\S]*?title="AI model"[\s\S]*?icon=\{Bot\}/);
    expect(source).toContain('<ModelPicker');
    expect(source).toContain('id="chat-model"');
    expect(source).toContain('onValueChange={handleModelChange}');
    expect(source).toContain("selectedModel.supportsImages ? 'Vision' : 'Text'");
    expect(source).toContain('selectedModel.quality');
    expect(source).toContain('selectedModel.caveat');
  });

  it('keeps the model picker as an accessible grouped listbox', () => {
    const picker = fs.readFileSync(path.join(process.cwd(), 'components', 'ModelPicker.tsx'), 'utf8');
    expect(picker).toContain('role="listbox"');
    expect(picker).toContain('role="option"');
    expect(picker).toContain('aria-selected={model.id === value}');
    expect(picker).toContain("case 'ArrowDown'");
    expect(picker).toContain("case 'ArrowUp'");
    expect(picker).toContain("case 'Home'");
    expect(picker).toContain("case 'End'");
    const tabCase = picker.match(/case 'Tab':\s*([\s\S]*?)\s*break;/);
    expect(tabCase?.[1]).toContain('closePicker(false);');
    expect(tabCase?.[1]).not.toContain('preventDefault');
    expect(picker).toContain("case 'Escape'");
    expect(picker).toContain('closePicker();');
    expect(picker).toContain('triggerRef.current?.focus();');
    expect(picker).toContain("document.addEventListener('mousedown', handlePointerDown)");
    expect(picker).not.toContain('onBlurCapture');
    expect(picker).not.toContain('handleBlurCapture');
    expect(picker).not.toContain('onPointerDownCapture');
    expect(picker).not.toContain('pointerInteractionWithinPickerRef');
    expect(picker).not.toContain('pointerInteractionCleanupTimeoutRef');
    expect(picker).toContain('<Tooltip key={capability} label={detail.label}>');
    expect(picker).toContain('title={detail.label}');
    expect(picker).toContain('title={label}');
    expect(picker).toContain('className="group relative inline-flex"');
    expect(picker).toContain('role="tooltip"');
    expect(picker).toContain('pointer-events-none absolute left-1/2 top-full z-40');
    expect(picker).toContain('group-hover:opacity-100');
  });

  it('uses shared model status on open and renders healthy and issue states without disabling options', () => {
    const picker = fs.readFileSync(path.join(process.cwd(), 'components', 'ModelPicker.tsx'), 'utf8');
    const openPicker = picker.match(/const openPicker = \(\) => \{([\s\S]*?)\n  \};/);

    expect(statusSource).toContain("fetch('/api/chat/model-status')");
    expect(statusSource).toContain('useChatModelStatus');
    expect(picker).toContain('useChatModelStatus();');
    expect(picker).not.toContain('/api/chat/local-status');
    expect(openPicker?.[1]).toContain('void refreshChatModelStatus();');
    expect(picker).not.toContain('setInterval');
    expect(picker).not.toContain('truncate');
    expect(picker).toContain('aria-label="Local model is healthy"');
    expect(picker).toContain('title="Local model is healthy"');
    expect(picker.match(/<LocalModelHealthDot \/>/g)).toHaveLength(2);
    expect(picker).toContain('Facing issues');
    expect(picker).toContain('isChatModelFacingIssues(model.id, modelStatus)');
    expect(picker).not.toContain('aria-disabled');
  });

  it('uses neutral/emerald model selection styling and a local provider label', () => {
    const picker = fs.readFileSync(path.join(process.cwd(), 'components', 'ModelPicker.tsx'), 'utf8');

    expect(picker).toContain("model.id === value && 'border-l-emerald-600");
    expect(picker).not.toContain("model.id === activeModelId && 'bg-amber");
    expect(picker).not.toContain('focus-visible:ring-amber');
    expect(source).toContain("selectedModel.provider === 'local' ? 'Local agent' : selectedModel.provider === 'groq' ? 'Groq' : 'NVIDIA'");
  });

  it('places the model listbox within the available viewport space', () => {
    const picker = fs.readFileSync(path.join(process.cwd(), 'components', 'ModelPicker.tsx'), 'utf8');
    expect(picker).toContain('useLayoutEffect');
    expect(picker).toContain("type ListboxPlacement = 'top' | 'bottom'");
    expect(picker).toContain('triggerRef.current?.getBoundingClientRect()');
    expect(picker).toContain('pickerRef.current?.getBoundingClientRect()');
    expect(picker).toContain("document.querySelector<HTMLElement>('nav[aria-label=\"Main navigation\"]')?.getBoundingClientRect()");
    expect(picker).toContain('const usableViewportTop = Math.max(VIEWPORT_MARGIN, (navigationRect?.bottom ?? 0) + NAVIGATION_MARGIN);');
    expect(picker).toContain('const availableAbove = Math.min(triggerRect.top, pickerRect.top) - usableViewportTop - LISTBOX_GAP;');
    expect(picker).toContain("window.addEventListener('resize', updateListboxPlacement)");
    expect(picker).toContain('style={{ maxHeight: `${listboxMaxHeight}px` }}');
    expect(picker).toContain("placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'");
    expect(picker).toContain('overflow-x-clip overflow-y-auto');
    expect(picker).toContain('ruler-scrollbar');
  });

  it('uses stable unique model and capability keys for listbox rendering', () => {
    expect(new Set(CHAT_MODELS.map((model) => model.id)).size).toBe(CHAT_MODELS.length);
    for (const model of CHAT_MODELS) {
      expect(new Set(model.capabilities).size).toBe(model.capabilities.length);
      expect(model.capabilities.every((capability) => CHAT_MODEL_CAPABILITIES.includes(capability))).toBe(true);
    }
  });

  it('requires a safe, focused confirmation when persisted chat would be cleared', () => {
    expect(source).toContain('hasPersistedChatMessages()');
    expect(source).toContain('ariaLabelledBy="chat-model-switch-title"');
    expect(source).toContain('Switch and clear chat');
    expect(source).toContain('clearChatHistoryStorage();');
    expect(source).toContain('dispatchChatModelSwitchClear();');
    expect(source).toContain('ref={modelCancelRef}');
  });

  it('links the current chat model to a focused, visibly marked settings target', () => {
    expect(chatSource).toContain('href="/settings?focus=ai-model"');
    expect(chatSource).toContain('const selectedModelDisplayName = getChatModelDisplayName(selectedModel, modelStatus.local);');
    expect(chatSource).toContain('Current AI model: ${selectedModelDisplayName}. Change in Settings');
    expect(chatSource).toContain('Current AI model: ${modelDisplayName}. Change in Settings');
    expect(chatSource.match(/title=\{selectedModelDisplayName\}/g)).toHaveLength(2);
    expect(chatSource).toContain('data-chat-model-settings-link');
    expect(chatSource.match(/href="\/settings\?focus=ai-model"/g)).toHaveLength(3);
    expect(source).toContain("get('focus') !== 'ai-model'");
    expect(source).toContain("document.getElementById('ai-model-setting')");
    expect(source).toContain("const modelControl = document.getElementById('chat-model')");
    expect(source).toContain('modelControl.focus({ preventScroll: true })');
    expect(source).toContain('modelTargetActive &&');
    expect(source).toContain("border-l-4 border-[var(--c-ink)]/45 bg-[var(--c-ink)]/5");
    expect(source).not.toContain("shadow-[inset_4px_0_0_rgba(245,158,11,0.65)]");
  });
});