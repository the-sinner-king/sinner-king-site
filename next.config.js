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

  // Headers for audio CORS — Web Audio API AnalyserNode requires it.
  // API routes (/api/aeris, /api/archivist) manage their own CORS in their
  // route handlers. Config-level headers stack on top of route-level headers,
  // creating duplicate Access-Control-Allow-Origin values — browser behavior
  // with duplicate ACAO is undefined and can leak the wildcard. Single source
  // of truth: each route owns its own CORS policy.
  async headers() {
    return [
      {
        // Audio files need CORS so the Web Audio API AnalyserNode can read them.
        // crossOrigin="anonymous" on <audio> alone is insufficient — the server
        // must also respond with Access-Control-Allow-Origin.
        source: '/audio/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
      {
        // Missive media (the Broadcast Tower's /s/<tag> pages can't inline images — 500 KB cap).
        // public/huff/media/* = canonical, content-stable filenames (EVIE naming canon), so a week
        // of browser cache is safe; a re-cut face lands within the week without a rename.
        source: '/huff/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' },
        ],
      },
    ]
  },

  // Turbopack (default in Next.js 16) — empty config silences webpack conflict warning
  turbopack: {},
}

module.exports = nextConfig
