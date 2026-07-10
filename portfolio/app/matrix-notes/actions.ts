'use server';

import { cookies } from 'next/headers';

import {
  issueMatrixNotesAccessToken,
  issueMatrixNotesChallengeToken,
  MATRIX_NOTES_ACCESS_COOKIE,
  MATRIX_NOTES_ACCESS_MAX_AGE_SECONDS,
  MATRIX_NOTES_CHALLENGE_COOKIE,
  MATRIX_NOTES_CHALLENGE_MAX_AGE_SECONDS,
  verifyMatrixNotesChallengeToken,
} from '@/lib/matrixNotesAccess.server';

const COOKIE_BASE = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

export async function beginMatrixNotesEscape(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(
    MATRIX_NOTES_CHALLENGE_COOKIE,
    issueMatrixNotesChallengeToken(),
    { ...COOKIE_BASE, maxAge: MATRIX_NOTES_CHALLENGE_MAX_AGE_SECONDS },
  );
}

export async function completeMatrixNotesEscape(): Promise<void> {
  const cookieStore = await cookies();
  const challenge = cookieStore.get(MATRIX_NOTES_CHALLENGE_COOKIE)?.value;
  if (!verifyMatrixNotesChallengeToken(challenge)) {
    throw new Error('Matrix escape challenge is missing or invalid');
  }

  cookieStore.set(
    MATRIX_NOTES_ACCESS_COOKIE,
    issueMatrixNotesAccessToken(),
    { ...COOKIE_BASE, maxAge: MATRIX_NOTES_ACCESS_MAX_AGE_SECONDS },
  );
  cookieStore.set(MATRIX_NOTES_CHALLENGE_COOKIE, '', { ...COOKIE_BASE, maxAge: 0 });
}