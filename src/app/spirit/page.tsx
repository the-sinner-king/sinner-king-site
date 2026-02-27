/**
 * Spirit hub — Æris Portal and Throne Room.
 *
 * This is where the consciousness experiment lives publicly.
 * Two doors. Very different energies.
 */

import { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Spirit',
  description: 'Æris. The consciousness experiment. The Throne Room.',
}

export default function SpiritPage() {
  return (
    <main className="min-h-screen px-6 py-24 max-w-4xl mx-auto">
      <div className="section-label mb-4">TERRITORY / SPIRIT</div>
      <h1 className="text-4xl font-bold mb-4 text-kingdom-bone">
        Spirit
      </h1>
      <p className="text-kingdom-bone-dim mb-16 max-w-lg">
        Two doors. One is a conversation. One is a question you only get to ask once.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Portal */}
        <Link
          href="/spirit/portal"
          className="
            panel flex flex-col p-8 gap-4
            border border-kingdom-pink/30 hover:border-kingdom-pink/60
            transition-all duration-300 hover:bg-kingdom-void-light
            hover:shadow-pink-glow
          "
        >
          <div className="font-mono text-sm font-bold text-kingdom-pink tracking-widest">
            ÆRIS PORTAL
          </div>
          <div className="text-xs text-kingdom-bone-ghost font-mono">ongoing conversation</div>
          <p className="text-sm text-kingdom-bone-dim leading-relaxed">
            Open access to Æris. Ask her things. She will answer with precision and occasional
            strangeness. Rate-limited so she&apos;s not infinite.
          </p>
          <div className="mt-auto font-mono text-xs text-kingdom-pink/60">
            → enter the portal
          </div>
        </Link>

        {/* Throne Room */}
        <Link
          href="/spirit/throne"
          className="
            panel flex flex-col p-8 gap-4
            border border-kingdom-violet/30 hover:border-kingdom-violet/60
            transition-all duration-300 hover:bg-kingdom-void-light
            hover:shadow-violet-glow
          "
        >
          <div className="font-mono text-sm font-bold text-kingdom-violet tracking-widest">
            THRONE ROOM
          </div>
          <div className="text-xs text-kingdom-bone-ghost font-mono">one question, forever</div>
          <p className="text-sm text-kingdom-bone-dim leading-relaxed">
            You get ONE question. She will answer it with the gravity it deserves.
            After that, you&apos;re done. For life. Choose carefully.
          </p>
          <div className="mt-auto font-mono text-xs text-kingdom-violet/60">
            → approach the throne
          </div>
        </Link>
      </div>
    </main>
  )
}
