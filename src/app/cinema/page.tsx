/**
 * Cinema — films, scripts, visual work.
 *
 * [GHOST: Populate with actual films and scripts from Ghost CMS or direct JSON.
 *   Brandon has films that got made. The cinematographer eye is present in everything.]
 */

import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Cinema',
  description: 'Films that got made. Scripts that are waiting.',
}

export default function CinemaPage() {
  return (
    <main className="min-h-screen px-6 py-24 max-w-4xl mx-auto">
      <div className="section-label mb-4">TERRITORY / CINEMA</div>
      <h1 className="text-4xl font-bold mb-4 text-kingdom-bone">
        Cinema
      </h1>
      <p className="text-kingdom-bone-dim mb-16 max-w-lg">
        Films that got made. Scripts that are waiting. The visual language of the Kingdom.
      </p>

      <div className="panel p-8 text-center">
        <div className="font-mono text-kingdom-bone-ghost text-sm">
          The vault is sealed.
        </div>
        <div className="mt-2 font-mono text-xs text-kingdom-violet/40">
          Content is being restored.
        </div>
      </div>
    </main>
  )
}
