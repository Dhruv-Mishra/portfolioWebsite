import { NextResponse, type NextRequest } from 'next/server';

const ADMIN_COOKIE_NAME = 'dhruv_admin_unlock';
const MATRIX_NOTES_ACCESS_COOKIE = 'dhruv_matrix_notes_access';

function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

function isMatrixNotesPath(pathname: string): boolean {
  return pathname === '/matrix-notes' || pathname.startsWith('/matrix-notes/');
}

function rewriteToNotFound(request: NextRequest): NextResponse {
  const notFoundUrl = request.nextUrl.clone();
  notFoundUrl.pathname = '/_not-found';
  return NextResponse.rewrite(notFoundUrl, { status: 404 });
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (isAdminPath(pathname) && !request.cookies.has(ADMIN_COOKIE_NAME)) {
    return rewriteToNotFound(request);
  }

  if (isMatrixNotesPath(pathname) && !request.cookies.has(MATRIX_NOTES_ACCESS_COOKIE)) {
    return rewriteToNotFound(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin',
    '/admin/:path*',
    '/matrix-notes',
    '/matrix-notes/:path*',
  ],
};