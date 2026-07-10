import { describe, expect, it, vi } from 'vitest';
import { WhisperPermissionRequest } from '@/lib/whisperPermissionRequest';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createStream() {
  const stop = vi.fn();
  return {
    stop,
    stream: { getTracks: () => [{ stop }] },
  };
}

async function requestMicrophone(
  request: WhisperPermissionRequest,
  getUserMedia: () => Promise<ReturnType<typeof createStream>['stream']>,
  onAccepted: (stream: ReturnType<typeof createStream>['stream']) => void,
) {
  const requestId = request.begin('whisper');
  if (requestId === null) return;
  const stream = await getUserMedia();
  if (request.settle(requestId, stream)) onAccepted(stream);
}

describe('Whisper permission request cancellation', () => {
  it.each(['reset', 'unmount', 'backend change'])(
    '%s invalidates a pending request and stops a stream that resolves later',
    async () => {
      const request = new WhisperPermissionRequest();
      const pendingStream = deferred<ReturnType<typeof createStream>['stream']>();
      const getUserMedia = vi.fn(() => pendingStream.promise);
      const onAccepted = vi.fn();
      const operation = requestMicrophone(request, getUserMedia, onAccepted);

      request.cancel();
      const { stream, stop } = createStream();
      pendingStream.resolve(stream);
      await operation;

      expect(getUserMedia).toHaveBeenCalledOnce();
      expect(stop).toHaveBeenCalledOnce();
      expect(onAccepted).not.toHaveBeenCalled();
    },
  );

  it('suppresses overlapping starts without opening another native prompt', async () => {
    const request = new WhisperPermissionRequest();
    const pendingStream = deferred<ReturnType<typeof createStream>['stream']>();
    const getUserMedia = vi.fn(() => pendingStream.promise);
    const onAccepted = vi.fn();

    const first = requestMicrophone(request, getUserMedia, onAccepted);
    const overlapping = requestMicrophone(request, getUserMedia, onAccepted);
    await overlapping;

    expect(getUserMedia).toHaveBeenCalledOnce();

    const { stream } = createStream();
    pendingStream.resolve(stream);
    await first;
    expect(onAccepted).toHaveBeenCalledOnce();
  });
});