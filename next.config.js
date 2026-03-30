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
  // FLAG #3 fix: never fall back to * — default to sinner-king.com in prod, localhost in dev
  async headers() {
    const isDev = process.env.NODE_ENV === 'development'
    const allowedOrigin = process.env.KINGDOM_ORIGIN
      || (isDev ? 'http://localhost:3033' : 'https://sinner-king.com')
    return [
      {
        // The Archivist needs * because the wiki is served from file:// during dev
        // and from the main domain in prod. file:// sends Origin: null which
        // can't be matched with a specific origin header.
        source: '/api/archivist',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
        ],
      },
      {
        // Audio files need CORS headers so the Web Audio API AnalyserNode can read them.
        // crossOrigin="anonymous" on <audio> alone is insufficient — the server must also
        // respond with Access-Control-Allow-Origin or the browser blocks context.createMediaElementSource().
        source: '/audio/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: allowedOrigin },
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
