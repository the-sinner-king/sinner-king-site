import type { Metadata } from 'next'
import { SinnerKingRadio } from '@/components/sinnerking-radio/SinnerKingRadio'

export const metadata: Metadata = {
  title: { absolute: 'Radio — The Sinner Kingdom' },
  description: 'Pirate radio broadcasting from the Sinner Kingdom. Synthwave AI covers of songs that shouldn\'t exist this way.',
}

export default function RadioPage() {
  return (
    <main style={{
      minHeight: '100vh',
      background: 'oklch(0.03 0.01 285)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 20px',
    }}>
      <SinnerKingRadio />
    </main>
  )
}
