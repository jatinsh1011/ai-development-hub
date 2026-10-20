/** Public origin of the site, used for canonical URLs, Open Graph, robots.txt and the sitemap. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
export const GITHUB_URL = 'https://github.com/jatinsh1011/ai-development-hub';
