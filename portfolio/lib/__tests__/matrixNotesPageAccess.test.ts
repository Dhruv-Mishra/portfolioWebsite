import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { cookiesMock, notFoundMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/headers', () => ({ cookies: cookiesMock }));
vi.mock('next/navigation', () => ({ notFound: notFoundMock }));
vi.mock('@/components/matrix/MatrixNotesWall', () => ({
  default: function MatrixNotesWallMock() {
    return null;
  },
}));

import MatrixNotesPage from '@/app/matrix-notes/page';
import {
  issueMatrixNotesAccessToken,
  MATRIX_NOTES_ACCESS_COOKIE,
} from '@/lib/matrixNotesAccess.server';

beforeAll(() => {
  process.env.MATRIX_NOTES_ACCESS_SECRET = 'matrix-page-test-secret';
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('matrix notes page access control', () => {
  it('renders the normal not-found path without signed access', async () => {
    cookiesMock.mockResolvedValue({ get: vi.fn(() => undefined) });

    await expect(MatrixNotesPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalledOnce();
  });

  it('renders the wall with a valid signed access cookie', async () => {
    const token = issueMatrixNotesAccessToken();
    cookiesMock.mockResolvedValue({
      get: vi.fn((name: string) => (
        name === MATRIX_NOTES_ACCESS_COOKIE ? { value: token } : undefined
      )),
    });

    await expect(MatrixNotesPage()).resolves.toMatchObject({
      type: expect.any(Function),
    });
    expect(notFoundMock).not.toHaveBeenCalled();
  });
});