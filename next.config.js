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
        // ⚠ MECHANISM (GU2 S390 F7): headers() matches on the URL PATTERN, not the status — an
        // unmatched path would carry this max-age on its 404 too, and a file added later would stay
        // dead for a week wherever that 404 was seen. So the rule is scoped to real asset extensions;
        // anything else under /huff falls back to Next's default (uncached) behaviour.
        source: '/huff/:path*.(jpg|jpeg|png|webp|mp4|zip)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' },
          // The missive is noindex; its media must be too — a meta tag ends at the document, this
          // header is the only thing that binds a crawler on an image/video/zip response (GU2 S390 F3).
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noimageindex, noarchive' },
        ],
      },
    ]
  },

  // Turbopack (default in Next.js 16) — empty config silences webpack conflict warning
  turbopack: {},
}

module.exports = nextConfig
