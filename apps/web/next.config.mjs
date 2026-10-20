/** @type {import('next').NextConfig} */
export default {
  transpilePackages: ['@aidev/artifact-schema'],
  reactStrictMode: true,
  // The landing page and the app have separate root layouts, so unmatched URLs need a global 404.
  experimental: { globalNotFound: true },
};
