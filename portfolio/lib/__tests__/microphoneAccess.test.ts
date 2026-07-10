import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatMicrophoneError,
  getMicrophonePermissionState,
  MicrophoneRequestGate,
  stopMediaStreamTracks,
} from '@/lib/microphoneAccess';

const originalNavigator = globalThis.navigator;

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: originalNavigator,
  });
});

describe('formatMicrophoneError', () => {
  it('explains a browser-level denied permission without exposing the raw error', () => {
    expect(formatMicrophoneError('not-allowed', { permissionState: 'denied' }))
      .toBe('Microphone access is blocked. Allow it in this site\'s browser settings, then try again.');
    expect(formatMicrophoneError(new DOMException('Permission denied', 'NotAllowedError'), {
      permissionState: 'denied',
    })).not.toContain('NotAllowed');
  });

  it('distinguishes a dismissed prompt from a persisted denial', () => {
    expect(formatMicrophoneError('not-allowed', { permissionState: 'prompt' }))
      .toBe('Microphone access was not granted. Try again and choose Allow in the browser prompt.');
  });

  it('reports policy and secure-context failures before generic permission guidance', () => {
    expect(formatMicrophoneError('not-allowed', { policyAllowsMicrophone: false }))
      .toBe('Microphone access is disabled for this page. Open the site directly and try again.');
    expect(formatMicrophoneError('not-allowed', { isSecureContext: false }))
      .toBe('Microphone access requires a secure HTTPS connection.');
  });

  it('provides actionable device availability guidance', () => {
    expect(formatMicrophoneError(new DOMException('', 'NotFoundError')))
      .toBe('No microphone was found. Connect one and try again.');
    expect(formatMicrophoneError(new DOMException('', 'NotReadableError')))
      .toBe('The microphone is unavailable or already in use. Close other apps using it, then try again.');
  });
});

describe('microphone deployment policy', () => {
  it('allows same-origin microphone access in standalone and nginx runtimes', () => {
    const nextConfig = fs.readFileSync(path.join(process.cwd(), 'next.config.ts'), 'utf8');
    const nginxConfig = fs.readFileSync(path.join(process.cwd(), 'nginx-cloudflare.conf'), 'utf8');

    expect(nextConfig).toContain('microphone=(self)');
    expect(nginxConfig).toContain('microphone=(self)');
    expect(nginxConfig).toContain('proxy_hide_header Permissions-Policy;');
    expect(nextConfig).not.toContain('microphone=()');
    expect(nginxConfig).not.toContain('microphone=()');
  });
});

describe('microphone permission inspection', () => {
  it.each(['granted', 'denied', 'prompt'] as const)(
    'reads the browser %s state without opening a media stream',
    async (state) => {
      const query = vi.fn().mockResolvedValue({ state });
      const getUserMedia = vi.fn();
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: { permissions: { query }, mediaDevices: { getUserMedia } },
      });

      await expect(getMicrophonePermissionState()).resolves.toBe(state);
      expect(query).toHaveBeenCalledOnce();
      expect(query).toHaveBeenCalledWith({ name: 'microphone' });
      expect(getUserMedia).not.toHaveBeenCalled();
    },
  );

  it('keeps voice input available when the browser rejects the permission descriptor', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        permissions: { query: vi.fn().mockRejectedValue(new TypeError('unsupported')) },
      },
    });

    await expect(getMicrophonePermissionState()).resolves.toBeUndefined();
  });
});

describe('microphone request lifecycle', () => {
  it('suppresses duplicate requests until the active browser prompt settles', () => {
    const gate = new MicrophoneRequestGate();
    const firstRequest = gate.begin();

    expect(firstRequest).not.toBeNull();
    expect(gate.begin()).toBeNull();
    expect(gate.settle(firstRequest!)).toBe(true);
    expect(gate.begin()).not.toBeNull();
  });

  it('invalidates a cancelled request and waits for it to settle before retrying', () => {
    const gate = new MicrophoneRequestGate();
    const request = gate.begin();

    gate.cancel();
    expect(gate.begin()).toBeNull();
    expect(gate.settle(request!)).toBe(false);
    expect(gate.begin()).not.toBeNull();
  });

  it('stops every media track even when one track throws during cleanup', () => {
    const firstStop = vi.fn(() => { throw new Error('already stopped'); });
    const secondStop = vi.fn();
    const stream = {
      getTracks: () => [{ stop: firstStop }, { stop: secondStop }],
    };

    expect(() => stopMediaStreamTracks(stream)).not.toThrow();
    expect(firstStop).toHaveBeenCalledOnce();
    expect(secondStop).toHaveBeenCalledOnce();
  });
});