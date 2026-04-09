/**
 * /glyph — GLYPH Demo Page
 *
 * Server wrapper so metadata is exported from a server component.
 * Client logic lives in ./client.tsx (GlyphClient).
 *
 * Metadata cannot be exported from a 'use client' file in Next.js App Router —
 * hence the split.
 */

import type { Metadata } from 'next'
import { GlyphClient } from './client'

export const metadata: Metadata = {
  title: { absolute: 'GLYPH — ASCII Template Generator' },
  description: 'Cyberpunk ASCII template generator. 3 free generations, then grab the open-source version. Bring your own Gemini API key. MIT licensed.',
}

export default function GlyphPage() {
  return <GlyphClient />
}
