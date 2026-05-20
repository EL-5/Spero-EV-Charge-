/**
 * middleware.ts
 * Next.js Edge Middleware — server-side route protection.
 *
 * WHY: The dashboard layout uses a client-side useEffect guard, which can be bypassed
 * by forging the `scms-auth` localStorage key. This middleware runs on the server
 * before any page renders, making it impossible to bypass from the browser.
 *
 * Protected routes: all routes except /login, static assets, and public API webhooks.
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Routes that do NOT require authentication
const PUBLIC_PATHS = ['/login'];
// Routes that are completely public (static assets, webhooks, etc.)
const PUBLIC_PREFIXES = ['/_next/', '/api/webhooks/', '/favicon', '/spero-logo'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public asset paths without any auth check
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Allow explicitly public pages
  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() validates the JWT with Supabase — cannot be forged client-side
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Redirect unauthenticated users to login, preserving the intended destination
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, robots.txt, sitemap.xml (static metadata files)
     * - /login (public auth page)
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};
