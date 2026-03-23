/**
 * /admin — Kingdom Command Panel
 *
 * Internal only. Obscure URL — no auth for now.
 * Live visitor feed + Kingdom state + content queue.
 */

import type { Metadata } from 'next'
import { AdminClient } from './client'

export const metadata: Metadata = {
  title:  'Kingdom Command',
  robots: { index: false, follow: false },
}

export default function AdminPage() {
  return <AdminClient />
}
