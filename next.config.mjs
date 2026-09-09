import { imageHosts } from './image-hosts.config.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  productionBrowserSourceMaps: true,
  distDir: process.env.DIST_DIR || '.next',

  typescript: {
    ignoreBuildErrors: true,
  },

  eslint: {
    ignoreDuringBuilds: true,
  },

  images: {
    remotePatterns: imageHosts,
    minimumCacheTTL: 60,
    qualities: [75, 85, 100],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [375, 640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  // Enable gzip/brotli compression
  compress: true,

  // Experimental: optimize package imports to reduce bundle size
  experimental: {
    // The Next 15.5 dev segment explorer references a missing bundled module in Webpack mode.
    devtoolSegmentExplorer: false,
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      '@heroicons/react',
      // Ensure these heavy SDKs are tree-shaken properly
      '@anthropic-ai/sdk',
      'docusign-esign',
    ],
  }
};
export default nextConfig;