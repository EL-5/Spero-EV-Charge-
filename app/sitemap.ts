import type { MetadataRoute } from 'next';

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? 'https://scms.speroev.com';

/**
 * sitemap.ts
 *
 * Generates /sitemap.xml consumed by Google Search Console and other crawlers.
 *
 * WHY only /login?
 * Every route except /login is behind Supabase authentication — Google cannot
 * crawl them (middleware redirects unauthenticated requests to /login).
 * Including authenticated URLs in the sitemap would waste crawl budget and
 * expose the application's internal URL structure unnecessarily.
 *
 * The middleware matcher already exempts sitemap.xml from auth checks, so this
 * file is served publicly without a redirect.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${BASE_URL}/login`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 1,
    },
  ];
}
