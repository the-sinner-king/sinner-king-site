/**
 * Strange Scraps — fragments, notes, unfinished things that escaped.
 * [GHOST: Wire Ghost CMS with tag:scraps filter]
 */
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Strange Scraps',
  description: 'Fragments that were too alive to delete.',
}

export default function ScrapsPage() {
  return (
    <main className="min-h-screen px-6 py-24 max-w-4xl mx-auto">
      <div className="section-label mb-4">ARCHIVE / STRANGE SCRAPS</div>
      <h1 className="text-4xl font-bold mb-4 text-kingdom-bone">Strange Scraps</h1>
      <p className="text-kingdom-bone-dim mb-16 max-w-lg">
        Fragments that survived. Too alive to delete. Too strange to categorize.
      </p>
      <div className="panel p-8 text-center font-mono text-sm text-kingdom-bone-ghost">
        [ Connect Ghost CMS — tag:scraps ]
      </div>
    </main>
  )
}
