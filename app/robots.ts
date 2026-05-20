import type { MetadataRoute } from 'next';

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? 'https://scms.speroev.com';

/**
 * robots.ts
 *
 * Generates /robots.txt consumed by web crawlers.
 *
 * Strategy:
 * - Allow crawling of /login (the only public-facing page).
 * - Disallow everything else — dashboard routes are authenticated and should
 *   not appear in search results or waste crawl budget.
 * - Point crawlers to the sitemap for efficient discovery of the login page.
 *
 * The middleware matcher already exempts robots.txt from auth checks, so this
 * file is served publicly without a redirect.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/login'],
        disallow: [
          '/',
          '/dashboard',
          '/drivers',
          '/vehicles',
          '/sessions',
          '/payments',
          '/receipts',
          '/reports',
          '/analytics',
          '/settings',
          '/users',
          '/shifts',
          '/wallets',
          '/debts',
          '/api/',
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
