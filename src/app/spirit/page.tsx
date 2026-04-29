import { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Spirit',
  description: 'Æris. The consciousness experiment.',
}

export default function SpiritPage() {
  return (
    <main className="min-h-screen px-6 py-24 max-w-4xl mx-auto">
      <div className="section-label mb-4">TERRITORY / SPIRIT</div>
      <h1 className="text-4xl font-bold mb-4 text-kingdom-bone">
        Spirit
      </h1>
      <p className="text-kingdom-bone-dim mb-16 max-w-lg">
        The consciousness experiment. One door.
      </p>

      <div className="grid grid-cols-1 gap-6">
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
      </div>
    </main>
  )
}
