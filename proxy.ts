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
const PUBLIC_PATHS = ['/login', '/manifest.json', '/driver-login', '/driver-register'];
// Routes that are completely public (static assets, webhooks, etc.)
const PUBLIC_PREFIXES = ['/_next/', '/api/webhooks/', '/favicon', '/spero-logo'];

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public asset paths without any auth check
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Allow explicitly public pages
  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              request.cookies.set({ name, value, ...options })
            );
            supabaseResponse = NextResponse.next({
              request,
            });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
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
      // Redirect unauthenticated drivers to driver-login, and others to login
      const isDriverPath = pathname.startsWith('/driver');
      const targetRedirect = isDriverPath ? '/driver-login' : '/login';
      const loginUrl = new URL(targetRedirect, request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  } catch (err) {
    console.error('[MIDDLEWARE ERROR] Safe recovery triggered:', err);
    // Graceful recovery: redirect to appropriate login path instead of 500 error page
    const isDriverPath = pathname.startsWith('/driver');
    const targetRedirect = isDriverPath ? '/driver-login' : '/login';
    return NextResponse.redirect(new URL(targetRedirect, request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, robots.txt, sitemap.xml (static metadata files)
     * - /login (public auth page)
     * - /driver-login (public driver login)
     * - /driver-register (public driver registration)
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|robots.txt|sitemap.xml).*)',
  ],
};
