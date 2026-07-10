import { MicrophoneRequestGate, stopMediaStreamTracks } from '@/lib/microphoneAccess';

type WhisperMediaStream = Parameters<typeof stopMediaStreamTracks>[0];

export interface WhisperPendingPermissionRequest {
  requestId: number;
  backend: string;
}

export class WhisperPermissionRequest {
  private readonly gate = new MicrophoneRequestGate();
  private readonly listeners = new Set<() => void>();
  private pendingRequest: WhisperPendingPermissionRequest | null = null;

  begin(backend: string): number | null {
    const requestId = this.gate.begin();
    if (requestId === null) return null;
    this.updatePendingRequest({ requestId, backend });
    return requestId;
  }

  cancel(): void {
    this.gate.cancel();
    this.updatePendingRequest(null);
  }

  settle(requestId: number, stream: WhisperMediaStream): boolean {
    if (this.gate.settle(requestId)) {
      this.updatePendingRequest(null);
      return true;
    }
    stopMediaStreamTracks(stream);
    return false;
  }

  isCurrent(requestId: number): boolean {
    return this.gate.isCurrent(requestId);
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): WhisperPendingPermissionRequest | null => this.pendingRequest;

  private updatePendingRequest(request: WhisperPendingPermissionRequest | null): void {
    if (this.pendingRequest === request) return;
    this.pendingRequest = request;
    this.listeners.forEach((listener) => listener());
  }
}