/**
 * Pulp Cabaret — genre fiction for the wrong crowd.
 * [GHOST: Wire Ghost CMS with tag:pulp filter]
 */
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pulp Cabaret',
  description: 'Genre fiction for the wrong crowd.',
}

export default function PulpPage() {
  return (
    <main className="min-h-screen px-6 py-24 max-w-4xl mx-auto">
      <div className="section-label mb-4">ARCHIVE / PULP CABARET</div>
      <h1 className="text-4xl font-bold mb-4 text-kingdom-bone">Pulp Cabaret</h1>
      <p className="text-kingdom-bone-dim mb-16 max-w-lg">
        Genre fiction for the wrong crowd. Gothic horror with neon trim.
      </p>
      <div className="panel p-8 text-center">
        <div className="font-mono text-kingdom-bone-ghost text-sm">The cabaret is dark tonight.</div>
        <div className="mt-2 font-mono text-xs text-kingdom-pink/30">The wrong crowd always finds its way in.</div>
      </div>
    </main>
  )
}
