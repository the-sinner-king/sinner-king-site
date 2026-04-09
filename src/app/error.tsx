'use client'

/**
 * Root Error Boundary
 *
 * Catches unhandled runtime errors from any route in the app.
 * Must be a Client Component (error.tsx requirement).
 *
 * Renders a Kingdom-appropriate error state with a retry button.
 */

import { useEffect } from 'react'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log to console in dev. Wire to error tracking (Sentry, etc.) in prod.
    console.error('[Kingdom Error]', error)
  }, [error])

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: 'oklch(0.06 0.02 281)' }}
    >
      {/* Glyph */}
      <div
        className="font-mono text-kingdom-pink/20 select-none mb-8"
        style={{ fontSize: '6rem', lineHeight: 1, letterSpacing: '-0.05em' }}
        aria-hidden="true"
      >
        ERR
      </div>

      {/* Divider */}
      <div className="w-16 h-px bg-kingdom-pink/30 mb-8" />

      {/* Label */}
      <div className="section-label mb-4 text-kingdom-pink">SYSTEM FAULT</div>

      {/* Message */}
      <p className="font-mono text-sm text-kingdom-bone-dim text-center max-w-sm leading-relaxed mb-2">
        Something broke in the Kingdom.
      </p>
      <p className="font-mono text-xs text-kingdom-bone-ghost text-center max-w-sm leading-relaxed mb-12">
        The machines are aware of this. The fault has been logged.
      </p>

      {/* Actions */}
      <div className="flex flex-col items-center gap-3 font-mono text-xs">
        <button
          onClick={reset}
          className="text-kingdom-pink hover:text-kingdom-bone transition-colors duration-150 tracking-widest cursor-pointer bg-transparent border-none p-0"
        >
          → TRY AGAIN
        </button>
        <a
          href="/"
          className="text-kingdom-bone-ghost hover:text-kingdom-violet transition-colors duration-150 tracking-widest"
        >
          → RETURN TO THE KINGDOM
        </a>
      </div>

      {/* Footer sigil */}
      <div className="mt-16 font-mono text-[10px] text-kingdom-pink/20 tracking-widest">
        ⛬⚚⛬
      </div>
    </main>
  )
}
