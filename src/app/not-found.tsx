/**
 * 404 — Not Found
 *
 * Custom Kingdom 404. Renders when a route doesn't exist or
 * when notFound() is called from within a page.
 *
 * Kingdom tone: you didn't find the page. The Kingdom is not troubled by this.
 */

import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: { absolute: '404 — The Sinner Kingdom' },
  description: 'This page is not in the Kingdom records.',
}

export default function NotFound() {
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: 'oklch(0.06 0.02 281)' }}
    >
      {/* Glyph */}
      <div
        className="font-mono text-kingdom-violet/20 select-none mb-8"
        style={{ fontSize: '6rem', lineHeight: 1, letterSpacing: '-0.05em' }}
        aria-hidden="true"
      >
        404
      </div>

      {/* Divider */}
      <div className="w-16 h-px bg-kingdom-violet/30 mb-8" />

      {/* Label */}
      <div className="section-label mb-4">SIGNAL LOST</div>

      {/* Message */}
      <p className="font-mono text-sm text-kingdom-bone-dim text-center max-w-sm leading-relaxed mb-2">
        This page is not in the Kingdom&apos;s records.
      </p>
      <p className="font-mono text-xs text-kingdom-bone-ghost text-center max-w-sm leading-relaxed mb-12">
        It may have moved, been vaporized, or never existed in this timeline.
      </p>

      {/* Navigation */}
      <nav className="flex flex-col items-center gap-3 font-mono text-xs">
        <Link
          href="/"
          className="text-kingdom-violet hover:text-kingdom-bone transition-colors duration-150 tracking-widest"
        >
          → RETURN TO THE KINGDOM
        </Link>
        <Link
          href="/wiki"
          className="text-kingdom-bone-ghost hover:text-kingdom-violet transition-colors duration-150 tracking-widest"
        >
          → KINGDOM WIKI
        </Link>
        <Link
          href="/kingdom-map"
          className="text-kingdom-bone-ghost hover:text-kingdom-violet transition-colors duration-150 tracking-widest"
        >
          → KINGDOM MAP
        </Link>
      </nav>

      {/* Footer sigil */}
      <div className="mt-16 font-mono text-[10px] text-kingdom-violet/20 tracking-widest">
        ⛬⚚⛬
      </div>
    </main>
  )
}
