import type { Metadata } from 'next'
import { WorldClient } from './client'

export const metadata: Metadata = {
  title: { absolute: 'The World — The Sinner Kingdom' },
  description: 'A glitch cathedral. Float above it.',
}

export default function WorldPage() {
  return (
    <main style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#000000' }}>
      <WorldClient />
    </main>
  )
}
