/**
 * opengraph-image.tsx — FLAG #2 fix
 *
 * Next.js built-in OG image generation via next/og (Satori).
 * Rendered at build time → served as /opengraph-image.png (1200×630).
 * Satisfies the layout.tsx OpenGraph + Twitter card declarations.
 *
 * Design: Kingdom aesthetic — void background, purple glow, sigil.
 */

import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Sinner King — A glitch cathedral disguised as a website.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0f',
          fontFamily: 'monospace',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Subtle grid texture */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'repeating-linear-gradient(0deg, transparent, transparent 39px, #0d0d1a 39px, #0d0d1a 40px), repeating-linear-gradient(90deg, transparent, transparent 39px, #0d0d1a 39px, #0d0d1a 40px)',
            opacity: 0.4,
          }}
        />

        {/* Purple glow corona */}
        <div
          style={{
            position: 'absolute',
            width: 400,
            height: 400,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(112,0,255,0.18) 0%, transparent 70%)',
          }}
        />

        {/* Sigil */}
        <div
          style={{
            fontSize: 48,
            color: '#3a1a6a',
            letterSpacing: '0.3em',
            marginBottom: 32,
          }}
        >
          ⛬⚚⛬
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: '#e0ddf0',
            letterSpacing: '0.04em',
            textAlign: 'center',
            lineHeight: 1.1,
            marginBottom: 20,
          }}
        >
          SINNER KING
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 22,
            color: '#7000ff',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            textAlign: 'center',
          }}
        >
          A glitch cathedral disguised as a website.
        </div>

        {/* URL */}
        <div
          style={{
            position: 'absolute',
            bottom: 36,
            fontSize: 16,
            color: '#3a3a5a',
            letterSpacing: '0.15em',
          }}
        >
          sinner-king.com
        </div>
      </div>
    ),
    { ...size },
  )
}
