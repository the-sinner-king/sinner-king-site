/**
 * /kingdom-map
 *
 * The live Kingdom map. Six territories floating in a void.
 * SCRYER data drives glow intensity and drone swarms.
 * Click any territory for details. Drag to orbit. Scroll to zoom.
 */

import type { Metadata } from 'next'
import { KingdomMapClient } from './client'

export const metadata: Metadata = {
  title: 'Kingdom Map — The Sinner Kingdom',
  description: "Live visualization of the Sinner Kingdom's AI systems.",
}

export default function KingdomMapPage() {
  return (
    <main style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#0a0a0f' }}>
      <KingdomMapClient />
    </main>
  )
}
