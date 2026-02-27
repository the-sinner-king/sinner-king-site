/**
 * Novels & Scripts — the long-form work.
 * [GHOST: Wire Ghost CMS with tag:novels filter, or direct JSON manifest]
 */
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Novels & Scripts',
  description: "The long-form work. They're still breathing.",
}

export default function NovelsPage() {
  return (
    <main className="min-h-screen px-6 py-24 max-w-4xl mx-auto">
      <div className="section-label mb-4">ARCHIVE / NOVELS & SCRIPTS</div>
      <h1 className="text-4xl font-bold mb-4 text-kingdom-bone">Novels & Scripts</h1>
      <p className="text-kingdom-bone-dim mb-16 max-w-lg">
        The long-form work. They took years. They&apos;re still here. Still breathing.
      </p>
      <div className="panel p-8 text-center font-mono text-sm text-kingdom-bone-ghost">
        [ Connect Ghost CMS — tag:novels ]
      </div>
    </main>
  )
}
