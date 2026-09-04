import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionToken } from './src/lib/auth/session';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect admin routes except login
  if (pathname.startsWith('/admin')) {
    const isLoginPage = pathname === '/admin/login';
    const sessionToken = request.cookies.get('resort_session')?.value;

    if (isLoginPage) {
      if (sessionToken) {
        const session = await verifySessionToken(sessionToken);
        if (session && session.sub) {
          return NextResponse.redirect(new URL('/admin/dashboard', request.url));
        }
      }
      return NextResponse.next();
    }

    if (!sessionToken) {
      const loginUrl = new URL('/admin/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    const session = await verifySessionToken(sessionToken);
    if (!session || !session.sub) {
      const response = NextResponse.redirect(new URL('/admin/login', request.url));
      response.cookies.delete('resort_session');
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};