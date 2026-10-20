import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/settings', '/login', '/register', '/org/new'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
