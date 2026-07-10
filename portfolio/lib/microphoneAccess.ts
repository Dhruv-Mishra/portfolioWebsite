export interface MicrophoneAccessContext {
  permissionState?: PermissionState;
  isSecureContext?: boolean;
  policyAllowsMicrophone?: boolean;
}

type PermissionsPolicyLike = {
  allowsFeature: (feature: string) => boolean;
};

type PolicyAwareDocument = Document & {
  permissionsPolicy?: PermissionsPolicyLike;
  featurePolicy?: PermissionsPolicyLike;
};

export class MicrophoneRequestGate {
  private generation = 0;
  private pending = false;

  begin(): number | null {
    if (this.pending) return null;
    this.pending = true;
    return ++this.generation;
  }

  cancel(): void {
    this.generation += 1;
  }

  settle(requestId: number): boolean {
    this.pending = false;
    return this.isCurrent(requestId);
  }

  isCurrent(requestId: number): boolean {
    return requestId === this.generation;
  }
}

export function stopMediaStreamTracks(
  stream: { getTracks: () => Array<Pick<MediaStreamTrack, 'stop'>> } | null | undefined,
): void {
  stream?.getTracks().forEach((track) => {
    try { track.stop(); } catch { /* no-op */ }
  });
}

function normalizeMicrophoneError(error: unknown): string {
  if (typeof error === 'string') return error.toLowerCase();
  if (!error || typeof error !== 'object') return '';

  const candidate = error as { error?: unknown; name?: unknown; message?: unknown };
  return [candidate.error, candidate.name, candidate.message]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
}

export function microphonePolicyAllows(): boolean | undefined {
  if (typeof document === 'undefined') return undefined;
  const policyDocument = document as PolicyAwareDocument;
  const policy = policyDocument.permissionsPolicy ?? policyDocument.featurePolicy;
  if (!policy) return undefined;

  try {
    return policy.allowsFeature('microphone');
  } catch {
    return undefined;
  }
}

export function microphoneAccessContext(
  permissionState?: PermissionState,
): MicrophoneAccessContext {
  return {
    permissionState,
    isSecureContext:
      typeof window === 'undefined' ? undefined : window.isSecureContext,
    policyAllowsMicrophone: microphonePolicyAllows(),
  };
}

export async function getMicrophonePermissionState(): Promise<PermissionState | undefined> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return undefined;

  try {
    const status = await navigator.permissions.query({
      name: 'microphone' as PermissionName,
    });
    return status.state;
  } catch {
    // Firefox and older WebKit builds may expose Permissions without
    // accepting the microphone descriptor. The microphone API remains usable.
    return undefined;
  }
}

export function formatMicrophoneError(
  error: unknown,
  context: MicrophoneAccessContext = {},
): string {
  const normalized = normalizeMicrophoneError(error);

  if (context.isSecureContext === false) {
    return 'Microphone access requires a secure HTTPS connection.';
  }
  if (context.policyAllowsMicrophone === false) {
    return 'Microphone access is disabled for this page. Open the site directly and try again.';
  }

  const isPermissionError =
    normalized.includes('not-allowed')
    || normalized.includes('notallowed')
    || normalized.includes('not allowed')
    || normalized.includes('permission denied')
    || normalized.includes('securityerror')
    || normalized.includes('service-not-allowed');
  if (isPermissionError && context.permissionState === 'denied') {
    return 'Microphone access is blocked. Allow it in this site\'s browser settings, then try again.';
  }
  if (isPermissionError && context.permissionState === 'prompt') {
    return 'Microphone access was not granted. Try again and choose Allow in the browser prompt.';
  }
  if (isPermissionError) {
    return 'Microphone access was not allowed. Check this site\'s microphone permission and try again.';
  }

  if (
    normalized.includes('audio-capture')
    || normalized.includes('notfounderror')
    || normalized.includes('devicesnotfounderror')
  ) {
    return 'No microphone was found. Connect one and try again.';
  }
  if (
    normalized.includes('notreadableerror')
    || normalized.includes('trackstarterror')
  ) {
    return 'The microphone is unavailable or already in use. Close other apps using it, then try again.';
  }
  if (normalized.includes('network')) {
    return 'Speech recognition could not reach the service. Check your connection and try again.';
  }
  if (normalized.includes('language-not-supported')) {
    return 'Speech recognition does not support this language. Try Local Transcription instead.';
  }

  return 'Voice input could not start. Try again.';
}