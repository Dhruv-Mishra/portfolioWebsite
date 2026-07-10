import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

export const MATRIX_NOTES_ACCESS_COOKIE = 'dhruv_matrix_notes_access';
export const MATRIX_NOTES_ACCESS_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
export const MATRIX_NOTES_CHALLENGE_COOKIE = 'dhruv_matrix_notes_challenge';
export const MATRIX_NOTES_CHALLENGE_MAX_AGE_SECONDS = 30 * 60;
export const MATRIX_NOTES_CHALLENGE_MIN_AGE_SECONDS = 20;

const ACCESS_TOKEN_PURPOSE = 'matrix-notes-access-v1';
const CHALLENGE_TOKEN_PURPOSE = 'matrix-notes-challenge-v1';
const DEVELOPMENT_SECRET = 'development-matrix-notes-access-secret';
const CLOCK_SKEW_MS = 60_000;

function getSigningSecret(): string | null {
  const secret = process.env.MATRIX_NOTES_ACCESS_SECRET?.trim();
  if (secret) return secret;

  return process.env.NODE_ENV === 'production' ? null : DEVELOPMENT_SECRET;
}

function sign(purpose: string, issuedAt: number, secret: string): string {
  return createHmac('sha256', secret)
    .update(`${purpose}|${issuedAt}`)
    .digest('hex');
}

function issueToken(purpose: string): string {
  const secret = getSigningSecret();
  if (!secret) {
    throw new Error('MATRIX_NOTES_ACCESS_SECRET is required in production');
  }

  const issuedAt = Date.now();
  return `${issuedAt.toString(36)}.${sign(purpose, issuedAt, secret)}`;
}

function verifyToken(
  token: string | null | undefined,
  purpose: string,
  maxAgeSeconds: number,
  minAgeSeconds = 0,
): boolean {
  if (!token) return false;

  const secret = getSigningSecret();
  if (!secret) return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [rawIssuedAt, providedSignature] = parts;
  if (!/^[0-9a-z]+$/.test(rawIssuedAt) || !/^[0-9a-f]{64}$/.test(providedSignature)) {
    return false;
  }
  const issuedAt = Number.parseInt(rawIssuedAt, 36);
  if (!Number.isFinite(issuedAt) || issuedAt <= 0) return false;

  const age = Date.now() - issuedAt;
  if (
    age < minAgeSeconds * 1000
    || age < -CLOCK_SKEW_MS
    || age > maxAgeSeconds * 1000
  ) {
    return false;
  }

  const expectedSignature = sign(purpose, issuedAt, secret);
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const providedBuffer = Buffer.from(providedSignature, 'utf8');
  if (expectedBuffer.length !== providedBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export function issueMatrixNotesChallengeToken(): string {
  return issueToken(CHALLENGE_TOKEN_PURPOSE);
}

export function verifyMatrixNotesChallengeToken(token: string | null | undefined): boolean {
  return verifyToken(
    token,
    CHALLENGE_TOKEN_PURPOSE,
    MATRIX_NOTES_CHALLENGE_MAX_AGE_SECONDS,
    MATRIX_NOTES_CHALLENGE_MIN_AGE_SECONDS,
  );
}

export function issueMatrixNotesAccessToken(): string {
  return issueToken(ACCESS_TOKEN_PURPOSE);
}

export function verifyMatrixNotesAccessToken(token: string | null | undefined): boolean {
  return verifyToken(
    token,
    ACCESS_TOKEN_PURPOSE,
    MATRIX_NOTES_ACCESS_MAX_AGE_SECONDS,
  );
}