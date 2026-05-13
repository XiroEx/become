import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'scontent-bos5-1.cdninstagram.com',
      },
      {
        protocol: 'https',
        hostname: '**.cdninstagram.com',
      },
      {
        protocol: 'https',
        hostname: '**.youtube.com',
      },
    ],
  },
  async headers() {
    return [
      // HTML responses MUST NOT be cached on the CDN. Next.js's default
      // `Cache-Control: s-maxage=31536000` (one year) for prerendered pages
      // breaks every deploy: the HTML keeps pointing at content-hashed
      // chunks from the previous build that no longer exist on the new
      // container → users see "page not found" until the cache evicts.
      //
      // /_next/static/** (hashed chunks + images) and /api/blob/** (content-
      // addressed objects) keep their own long-lived immutable caching;
      // they're scoped out by the exclusion below.
      {
        source: '/((?!_next/static|_next/image|api/blob|favicon.ico|icons/|logo.png|profile.png|manifest.json|exercises/).*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, must-revalidate',
          },
        ],
      },
      {
        source: '/exercises/:path*.mov',
        headers: [
          {
            key: 'Content-Type',
            value: 'video/mp4',
          },
          {
            key: 'Accept-Ranges',
            value: 'bytes',
          },
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/exercises/:path*.mp4',
        headers: [
          {
            key: 'Content-Type',
            value: 'video/mp4',
          },
          {
            key: 'Accept-Ranges',
            value: 'bytes',
          },
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
