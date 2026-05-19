'use client'

import { usePathname } from 'next/navigation'

// Routes where global overlays are suppressed — the world owns its own atmosphere.
const OVERLAY_SUPPRESS = ['/world']

export function GlobalOverlays() {
  const pathname = usePathname()
  if (!pathname || OVERLAY_SUPPRESS.some(p => pathname === p || pathname.startsWith(p + '/'))) return null

  return (
    <>
      <div
        aria-hidden="true"
        className="
          fixed inset-0 z-[9999] pointer-events-none
          bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,0,0,0.03)_2px,rgba(0,0,0,0.03)_4px)]
        "
      />
      <div
        aria-hidden="true"
        className="
          fixed inset-0 z-0 pointer-events-none
          bg-grid-kingdom bg-grid
          opacity-40
        "
      />
    </>
  )
}
