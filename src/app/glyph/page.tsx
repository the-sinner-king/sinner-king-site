import { redirect } from 'next/navigation'

export const metadata = {
  title: { absolute: 'GLYPH — ASCII Template Generator' },
  description: 'Cyberpunk ASCII template generator. Open-source, MIT licensed.',
}

export default function GlyphPage() {
  redirect('https://the-sinner-king.github.io/glyph/')
}
