/**
 * /wiki — Kingdom Wiki index
 *
 * Lists all 85 CORE LORE pages sorted by last git commit (most recent first).
 * Data source: public/wiki-manifest.json — built by scripts/build-wiki.mjs at
 * build time. Real git timestamps, no synthetic dates.
 *
 * Server component — no 'use client'.
 */

import { Metadata } from 'next'
import Link from 'next/link'
import manifest from '../../../public/wiki-manifest.json'

// --- Types ---

interface WikiPage {
  slug: string
  title: string
  description: string | null
  tags: string[]
  updated_at: string
  content_md: string
}

interface WikiManifest {
  generated_at: string
  page_count: number
  pages: WikiPage[]
}

// --- Metadata ---

export const metadata: Metadata = {
  title: 'Kingdom Wiki — The Sinner Kingdom',
  description: 'CORE LORE knowledge base — the documented laws, systems, and lore of the Sinner Kingdom.',
}

// --- Helpers ---

function timeAgo(isoString: string): string {
  const now = Date.now()
  const then = new Date(isoString).getTime()
  const diffMs = now - then

  if (diffMs < 0) return 'just now'

  const seconds = Math.floor(diffMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const weeks = Math.floor(days / 7)
  const months = Math.floor(days / 30)
  const years = Math.floor(days / 365)

  if (seconds < 60) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  if (weeks < 5) return `${weeks} week${weeks === 1 ? '' : 's'} ago`
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`
  return `${years} year${years === 1 ? '' : 's'} ago`
}

// --- Component ---

export default function WikiIndexPage() {
  const typed = manifest as WikiManifest
  // manifest is already sorted by updated_at desc from build script
  const pages = typed.pages

  return (
    <main className="min-h-screen px-6 py-24 max-w-4xl mx-auto">
      <div className="section-label mb-4">TERRITORY / WIKI</div>
      <h1 className="text-4xl font-bold mb-4 text-kingdom-bone">
        Kingdom Wiki
      </h1>
      <p className="text-kingdom-bone-dim mb-4 max-w-lg">
        CORE LORE — the documented laws, systems, and lore of the Sinner Kingdom.
      </p>
      <p className="font-mono text-xs text-kingdom-bone-ghost mb-16">
        {pages.length} documents — updated from live git history
      </p>

      <div className="flex flex-col gap-2">
        {pages.map((page) => (
          <Link
            key={page.slug}
            href={`/wiki/${page.slug}`}
            className="
              panel p-4 flex flex-col gap-1 border border-kingdom-violet/20
              hover:border-kingdom-violet/60 hover:bg-kingdom-void-light
              transition-all duration-150 group
            "
          >
            <div className="flex items-baseline justify-between gap-4">
              <span className="font-mono text-sm font-bold text-kingdom-bone group-hover:text-kingdom-violet transition-colors duration-150 truncate">
                {page.title}
              </span>
              <span className="font-mono text-xs text-kingdom-bone-ghost shrink-0">
                {timeAgo(page.updated_at)}
              </span>
            </div>
            {page.description && (
              <p className="text-xs text-kingdom-bone-dim leading-relaxed">
                {page.description}
              </p>
            )}
            {page.tags.length > 0 && (
              <div className="flex gap-2 mt-1 flex-wrap">
                {page.tags.map((tag) => (
                  <span
                    key={tag}
                    className="font-mono text-[10px] text-kingdom-cyan/70 border border-kingdom-cyan/20 px-1.5 py-0.5 rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </Link>
        ))}
      </div>
    </main>
  )
}
