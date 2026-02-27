/** @type {import('next').NextConfig} */
const nextConfig = {
  // Transpile Three.js and related packages for App Router compatibility
  transpilePackages: ['three'],

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

  // Experimental features for performance
  experimental: {
    // Partial pre-rendering for hybrid static/dynamic pages
    ppr: false,
    // React compiler (opt-in when stable)
    reactCompiler: false,
  },

  // Webpack config for GLSL shaders (future use for Three.js)
  webpack(config) {
    config.module.rules.push({
      test: /\.(glsl|vs|fs|vert|frag)$/,
      use: ['raw-loader', 'glslify-loader'],
    })
    return config
  },
}

module.exports = nextConfig
