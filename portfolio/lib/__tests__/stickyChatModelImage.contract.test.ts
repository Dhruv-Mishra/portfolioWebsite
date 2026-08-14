import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  path.join(process.cwd(), 'hooks', 'useStickyChat.ts'),
  'utf8',
);

describe('sticky chat model and image request contract', () => {
  it('sends the selected model and request-only image data to chat', () => {
    expect(source).toContain('const requestedModelId = getChatModelPref();');
    expect(source).toContain("if (requestedModelId === 'qwen-3.5-4b-local')");
    expect(source).toContain('void refreshChatModelStatus({ force: true });');
    expect(source).toContain('model: requestedModelId');
    expect(source).toContain("...(image ? { image: { dataUrl: image.dataUrl } } : {})");
    expect(source).toContain('sendMessage: (content: string, image?: ChatImageAttachment) => Promise<boolean>');
  });

  it('keeps image previews out of persistent chat history and clears mounted chats on model changes', () => {
    expect(source).toContain('delete persistentMessage.imagePreviewDataUrl;');
    expect(source).toContain('delete persistentMessage.imageName;');
    expect(source).toContain('CHAT_MODEL_SWITCH_CLEAR_EVENT');
    expect(source).toContain('clearForCrossTabModelSwitch');
  });

  it('binds pending recovery and request cleanup to their originating model and controller', () => {
    expect(source).toContain('modelId: ReturnType<typeof getChatModelPref>;');
    expect(source).toContain('modelId: requestedModelId,');
    expect(source).toContain('parsed.modelId !== getChatModelPref()');
    expect(source).toContain('const controller = new AbortController();');
    expect(source).toContain('controller.abort(\'timeout\');');
    expect(source).toContain('if (abortControllerRef.current === controller)');
    expect(source).toContain('if (abortControllerRef.current !== controller) return;');
    expect(source).toContain('clearPendingChatRecovery(assistantId);');
    expect(source).toContain('isLoadingRef.current = false;');
  });

  it('marks only the requested model as facing issues when the response falls back locally', () => {
    expect(source).toContain("response.headers.get('X-Chat-Fallback') === 'localStatic'");
    expect(source).toContain('markChatModelFacingIssues(requestedModelId);');
    expect(source).not.toContain("markChatModelFacingIssues(response.headers.get(");
  });
});