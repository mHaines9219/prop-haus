import type { NextConfig } from 'next';

const config: NextConfig = {
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
