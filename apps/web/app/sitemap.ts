import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const page = (path: string, priority: number, changeFrequency: 'daily' | 'weekly' | 'monthly') =>
    ({ url: `${SITE_URL}${path}`, changeFrequency, priority });
  return [
    page('/', 1, 'weekly'),
    page('/explore', 0.8, 'daily'),
    page('/search', 0.8, 'daily'),
    page('/docs', 0.7, 'monthly'),
    page('/publish', 0.4, 'monthly'),
  ];
}
