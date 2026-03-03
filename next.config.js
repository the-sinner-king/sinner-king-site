/** @type {import('next').NextConfig} */
const nextConfig = {
  // Transpile Three.js and related packages for App Router compatibility
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei'],

  // Image domains for Ghost CMS and kingdom assets
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'sinner-king.com',
      },
      {
        protocol: 'https',
        hostname: '*.ghost.io',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      },
    ],
  },

  // Headers for SCRYER feed CORS (local Kingdom reads)
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: process.env.KINGDOM_ORIGIN || '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
    ]
  },

  // Turbopack (default in Next.js 16) — empty config silences webpack conflict warning
  turbopack: {},
}

module.exports = nextConfig
