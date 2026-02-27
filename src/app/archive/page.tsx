/**
 * Archive hub — writing, scraps, novels, pulp.
 *
 * The Archive is the oldest part of the Kingdom made visible.
 * Everything that survived. Everything worth keeping.
 *
 * Sub-sections:
 *   /archive/scraps   — Strange Scraps: fragments, notes, unfinished things
 *   /archive/pulp     — The Pulp Cabaret: genre fiction, serialized, weird
 *   /archive/novels   — Novels & Scripts: the long-form work
 *
 * Data source: Ghost CMS (headless).
 * Ghost organizes by tag — "scraps", "pulp", "novels".
 *
 * [GHOST: Wire Ghost Content API when CMS is live.
 *   See ghost-content-api package. Pattern:
 *   const api = new GhostContentAPI({ url, key, version: 'v5.0' })
 *   const posts = await api.posts.browse({ filter: 'tag:scraps', limit: 20 })]
 */

import { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Archive',
  description: 'Strange Scraps. The Pulp Cabaret. Novels nobody asked for.',
}

const SECTIONS = [
  {
    href: '/archive/scraps',
    label: 'STRANGE SCRAPS',
    tagline: 'fragments that survived',
    color: 'text-kingdom-amber',
    border: 'border-kingdom-amber/30 hover:border-kingdom-amber/70',
    description:
      'Notes, fragments, half-finished things that were too alive to delete. The Archive of What Escaped.',
  },
  {
    href: '/archive/pulp',
    label: 'PULP CABARET',
    tagline: 'genre fiction for the wrong crowd',
    color: 'text-kingdom-pink',
    border: 'border-kingdom-pink/30 hover:border-kingdom-pink/70',
    description:
      'Serialized weirdness. Gothic horror with neon trim. Horror that makes you feel something wrong.',
  },
  {
    href: '/archive/novels',
    label: 'NOVELS & SCRIPTS',
    tagline: 'long-form & cinematic work',
    color: 'text-kingdom-violet',
    border: 'border-kingdom-violet/30 hover:border-kingdom-violet/70',
    description:
      "The novels. The screenplays. The things that take years. They're still here. They're still breathing.",
  },
]

export default function ArchivePage() {
  return (
    <main className="min-h-screen px-6 py-24 max-w-4xl mx-auto">
      <div className="section-label mb-4">TERRITORY / ARCHIVE</div>
      <h1 className="text-4xl font-bold mb-4 text-kingdom-bone">
        The Archive
      </h1>
      <p className="text-kingdom-bone-dim mb-16 max-w-lg">
        Everything that survived. Organized by how strange it got.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className={`
              panel p-6 flex flex-col gap-3 border transition-all duration-200
              hover:bg-kingdom-void-light
              ${s.border}
            `}
          >
            <div className={`font-mono text-sm font-bold tracking-widest ${s.color}`}>
              {s.label}
            </div>
            <div className="text-xs text-kingdom-bone-ghost font-mono">{s.tagline}</div>
            <p className="text-sm text-kingdom-bone-dim leading-relaxed">{s.description}</p>
          </Link>
        ))}
      </div>
    </main>
  )
}
