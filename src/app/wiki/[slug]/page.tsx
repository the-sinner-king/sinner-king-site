/**
 * /wiki/[slug] — Individual Kingdom Wiki page
 *
 * Statically generated at build time from wiki-manifest.json.
 * 85 slugs → 85 static pages. Real git timestamps for "Updated X ago".
 *
 * Markdown is rendered as-is in a <pre> block. Aeris will design the
 * full prose treatment later — this is functional first.
 *
 * Server component — no 'use client'.
 */

import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import manifest from '../../../../public/wiki-manifest.json'
import { timeAgo } from '@/lib/time-ago'

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

// --- Static params ---

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const typed = manifest as WikiManifest
  return typed.pages.map((p) => ({ slug: p.slug }))
}

// --- Metadata ---

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const typed = manifest as WikiManifest
  const page = typed.pages.find((p) => p.slug === slug)

  if (!page) {
    return { title: 'Not Found — Kingdom Wiki' }
  }

  return {
    title: `${page.title} — Kingdom Wiki`,
    description: page.description ?? `${page.title} — CORE LORE document.`,
  }
}

// --- Component ---

export default async function WikiSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const typed = manifest as WikiManifest
  const page = typed.pages.find((p) => p.slug === slug)

  if (!page) {
    notFound()
  }

  return (
    <main className="min-h-screen px-6 py-24 max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 font-mono text-xs text-kingdom-bone-ghost mb-8">
        <Link href="/wiki" className="hover:text-kingdom-violet transition-colors duration-150">
          WIKI
        </Link>
        <span className="text-kingdom-violet/40">/</span>
        <span className="text-kingdom-bone-dim truncate">{page.title}</span>
      </div>

      {/* Header */}
      <div className="mb-10 border-b border-kingdom-violet/15 pb-8">
        <div className="section-label mb-4">CORE LORE / WIKI</div>
        <h1 className="text-3xl font-bold text-kingdom-bone mb-3 leading-tight">
          {page.title}
        </h1>
        <div className="flex items-center gap-4 font-mono text-xs text-kingdom-bone-ghost">
          <span>Updated {timeAgo(page.updated_at)}</span>
          {page.tags.length > 0 && (
            <>
              <span className="text-kingdom-violet/30">—</span>
              <div className="flex gap-2 flex-wrap">
                {page.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-kingdom-cyan/70 border border-kingdom-cyan/20 px-1.5 py-0.5 rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
        {page.description && (
          <p className="mt-4 text-sm text-kingdom-bone-dim leading-relaxed max-w-2xl">
            {page.description}
          </p>
        )}
      </div>

      {/* Content — pre block, Aeris will design prose treatment later */}
      <div className="panel border border-kingdom-violet/20 p-6">
        <pre className="whitespace-pre-wrap font-mono text-sm text-kingdom-bone-dim leading-relaxed overflow-x-auto">
          {page.content_md}
        </pre>
      </div>

      {/* Footer nav */}
      <div className="mt-12 pt-6 border-t border-kingdom-violet/15">
        <Link
          href="/wiki"
          className="font-mono text-xs text-kingdom-violet hover:text-kingdom-bone transition-colors duration-150"
        >
          ← Back to Kingdom Wiki
        </Link>
      </div>
    </main>
  )
}
