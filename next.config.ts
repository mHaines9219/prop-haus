import type { NextConfig } from 'next';

const config: NextConfig = {
  // The Jobs board moved under each project (Sep 2026): the Dashboard is
  // Projects only. Old links and bookmarks land on the dashboard.
  async redirects() {
    return [
      { source: '/jobs', destination: '/projects', permanent: true },
      { source: '/jobs/:path*', destination: '/projects', permanent: true },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.newel.com' },
      { protocol: 'https', hostname: 'newel.com' },
      { protocol: 'https', hostname: '**.propnspoon.com' },
      { protocol: 'https', hostname: 'propnspoon.com' },
      { protocol: 'https', hostname: '**.eclecticprops.com' },
      { protocol: 'https', hostname: 'eclecticprops.com' },
      { protocol: 'https', hostname: '**' },
    ],
  },
};

export default config;
